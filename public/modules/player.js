/**
 * ==========================================================================
 * PLAYER MODULE
 * YouTube Player API, HTML5 video element, iframe embed and audio management.
 * ==========================================================================
 */

import { DOM } from './dom.js';
import { AppState } from './state.js';
import { showToast, syncUrlParams } from './ui.js';
import { fetchLatestCloudState } from './api.js';

export let activeNativeVideo = null;
export let ytPlayerInstance = null;
export let isYtApiReady = (typeof window !== 'undefined' && typeof YT !== 'undefined' && YT.loaded);
export let pendingYtVideoId = null;

// Callback emisor que se conecta con sync.js
let playbackSyncEmitter = null;
export function setPlaybackSyncEmitter(emitter) {
  playbackSyncEmitter = emitter;
}

// Hook de YouTube API Ready
if (typeof window !== 'undefined') {
  const previousYtReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    if (typeof previousYtReady === 'function') previousYtReady();
    isYtApiReady = true;
    if (pendingYtVideoId) {
      initYouTubePlayer(pendingYtVideoId);
    }
  };

  if (typeof YT !== 'undefined' && YT.Player) {
    isYtApiReady = true;
  }
}

export function extractYouTubeId(url) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return (ytMatch && ytMatch[1]) ? ytMatch[1] : null;
}

export function initYouTubePlayer(videoId, initialSyncState = null) {
  pendingYtVideoId = null;
  try {
    ytPlayerInstance = new YT.Player('yt-player-target', {
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: AppState.isAdmin ? 1 : 0,
        playsinline: 1,
        rel: 0,
        enablejsapi: 1
      },
      events: {
        onReady: (e) => {
          if (AppState.isAdmin) {
            e.target.playVideo();
          } else {
            try { e.target.mute(); } catch (err) {}

            if (initialSyncState && initialSyncState.isPlaying) {
              const latency = Math.max(0, (Date.now() - initialSyncState.updatedAt) / 1000);
              const target = (initialSyncState.currentTime || 0) + latency;
              e.target.seekTo(target, true);
              e.target.playVideo();
            } else {
              const target = initialSyncState ? (initialSyncState.currentTime || 0) : 0;
              e.target.seekTo(target, true);
              e.target.pauseVideo();
            }
          }
        },
        onStateChange: (e) => {
          if (AppState.isAdmin && typeof playbackSyncEmitter === 'function') {
            const state = e.data;
            const currentTime = e.target.getCurrentTime() || 0;
            if (state === 1) { // Playing
              playbackSyncEmitter(currentTime, true);
            } else if (state === 2) { // Paused
              playbackSyncEmitter(currentTime, false);
            } else if (state === 3) { // Buffering (Seek)
              playbackSyncEmitter(currentTime, true);
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn('Error inicializando YT.Player', e);
  }
}

export function isWhepStream(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.endsWith('/whep') || cleanUrl.includes('/whep?');
}

export function isHlsStream(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.endsWith('.m3u8') || cleanUrl.includes('.m3u8?');
}

export function isDirectVideoFile(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return isWhepStream(url) ||
    isHlsStream(url) ||
    cleanUrl.endsWith('.mp4') || 
    cleanUrl.endsWith('.webm') || 
    cleanUrl.endsWith('.ogg') || 
    cleanUrl.endsWith('.mkv') ||
    cleanUrl.includes('.mp4?') ||
    cleanUrl.includes('blob.vercel-storage') ||
    cleanUrl.includes('catbox.moe');
}

export let activeHlsInstance = null;
export let activeHlsPoller = null;
export let activeWhepPc = null;
export let whepReconnectTimer = null;
// Hook que sync.js invoca cuando el servidor confirma (vía /api/sync) que el stream
// volvió a estar online, para reanudar HLS sin que el cliente tenga que sondear
// el .m3u8 crudo por su cuenta (eso es lo que generaba 404 visibles en consola).
export let hlsRetryFn = null;

// Gestor global único de activación de audio por interacción (evita múltiples listeners)
if (typeof window !== 'undefined' && !window._soundInteractionRegistered) {
  window._soundInteractionRegistered = true;
  const onFirstInteraction = () => {
    const v = document.getElementById('main-theater-video');
    if (v) {
      v.muted = false;
      v.volume = 1.0;
      updateVideoVolume(100);
      v.play().catch(() => {});
      console.log('%c[DualStream Audio Monitor] 🔊 Audio único desmuteado por interacción', 'color: #38bdf8; font-weight: bold;');
    }
  };
  document.addEventListener('click', onFirstInteraction, { once: true });
  document.addEventListener('touchstart', onFirstInteraction, { once: true });
}

export function renderNativeVideo(url, initialSyncState = null) {
  // Destruir cualquier instancia HLS previa
  if (activeHlsInstance) {
    try {
      activeHlsInstance.stopLoad();
      activeHlsInstance.detachMedia();
      activeHlsInstance.destroy();
    } catch (e) {}
    activeHlsInstance = null;
  }
  if (activeHlsPoller) {
    clearInterval(activeHlsPoller);
    activeHlsPoller = null;
  }
  hlsRetryFn = null;

  // Reutilizar el elemento de video singleton existente o crearlo si no existe
  let videoElem = document.getElementById('main-theater-video');
  if (!videoElem) {
    videoElem = document.createElement('video');
    videoElem.id = 'main-theater-video';
    videoElem.className = 'native-video-player';
  }

  // Purgar y detener físicamente cualquier otro elemento de audio/video duplicado
  document.querySelectorAll('video, audio').forEach(el => {
    if (el !== videoElem) {
      try { el.pause(); el.removeAttribute('src'); el.load(); } catch(e) {}
      el.remove();
    }
  });

  videoElem.controls = AppState.isAdmin;
  videoElem.autoplay = true;
  videoElem.playsInline = true;
  videoElem.setAttribute('playsinline', 'true');
  videoElem.setAttribute('webkit-playsinline', 'true');
  videoElem.preload = 'auto';
  videoElem.volume = 1.0;
  videoElem.dataset.url = url;
  activeNativeVideo = videoElem;

  const wrapper = document.getElementById('movie-media-wrapper') || DOM.movieMediaWrapper;
  if (wrapper && !wrapper.contains(videoElem)) {
    wrapper.innerHTML = '';
    wrapper.appendChild(videoElem);
  }

  const setPlayerOffline = () => {
    videoElem.dataset.offline = 'true';
    document.body.classList.add('viewer-standby');
    try { 
      videoElem.pause();
    } catch(e) {}
    const offlineScreen = document.getElementById('theater-offline-screen');
    const onlineScreen = document.getElementById('theater-online-screen');
    const placeholder = document.getElementById('movie-placeholder');
    const mediaWrapper = document.getElementById('movie-media-wrapper');
    const title = document.getElementById('current-video-title');

    if (offlineScreen) offlineScreen.style.setProperty('display', 'flex', 'important');
    if (onlineScreen) onlineScreen.style.setProperty('display', 'none', 'important');
    if (placeholder) placeholder.style.setProperty('display', 'none', 'important');
    if (mediaWrapper) mediaWrapper.style.setProperty('display', 'none', 'important');
    if (title) title.textContent = 'Stream Fuera de Línea';
  };

  const setPlayerOnline = () => {
    console.log('%c[DualStream] 🟢 SET PLAYER ONLINE: Destapando video en vivo y ocultando pantalla offline', 'color: #53fc18; font-weight: bold;');
    videoElem.dataset.offline = 'false';
    document.body.classList.remove('viewer-standby');
    const offlineScreen = document.getElementById('theater-offline-screen');
    const onlineScreen = document.getElementById('theater-online-screen');
    const placeholder = document.getElementById('movie-placeholder');
    const mediaWrapper = document.getElementById('movie-media-wrapper');
    const title = document.getElementById('current-video-title');

    if (offlineScreen) offlineScreen.style.setProperty('display', 'none', 'important');
    if (onlineScreen) onlineScreen.style.setProperty('display', 'none', 'important');
    if (placeholder) placeholder.style.setProperty('display', 'none', 'important');
    if (mediaWrapper) mediaWrapper.style.setProperty('display', 'block', 'important');
    if (title) title.textContent = 'En Vivo';

    const playPromise = videoElem.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log('[DualStream] ▶️ Video reproduciéndose a 60 FPS');
      }).catch((e) => {
        console.warn('[DualStream] Autoplay bloqueado por navegador, muting inicial:', e);
        videoElem.muted = true;
        videoElem.play().catch(() => {});
      });
    }
  };

  // ==========================================
  // TELEMETRÍA & DIAGNÓSTICO EN VIVO (HUD)
  // ==========================================
  const telemetryState = {
    isOpen: false,
    lastFrameCount: 0,
    lastFrameTime: performance.now(),
    currentFps: 0,
    droppedFrames: 0,
    bufferSeconds: 0,
    downloadSpeedMbps: 0,
    downloadLatencyMs: 0,
    liveDelaySec: 0,
    resolution: '--',
    events: [],
    pollTimer: null
  };

  const addTelemetryLog = (msg, type = 'info') => {
    const timeStr = new Date().toLocaleTimeString();
    const logItem = `[${timeStr}] ${msg}`;
    telemetryState.events.unshift({ text: logItem, type });
    if (telemetryState.events.length > 30) telemetryState.events.pop();

    const logContainer = document.getElementById('hud-events-log');
    if (logContainer) {
      logContainer.innerHTML = telemetryState.events.map(ev => 
        `<div class="telemetry-log-item ${ev.type}">${ev.text}</div>`
      ).join('');
    }
  };

  const updateTelemetryHud = () => {
    if (!videoElem) return;

    // 1. FPS y Cuadros Perdidos
    if (typeof videoElem.getVideoPlaybackQuality === 'function') {
      const q = videoElem.getVideoPlaybackQuality();
      const now = performance.now();
      const timeDiff = (now - telemetryState.lastFrameTime) / 1000;
      if (timeDiff >= 0.8) {
        const frameDiff = q.totalVideoFrames - telemetryState.lastFrameCount;
        telemetryState.currentFps = Math.max(0, Math.round(frameDiff / timeDiff));
        telemetryState.lastFrameCount = q.totalVideoFrames;
        telemetryState.lastFrameTime = now;
      }
      telemetryState.droppedFrames = q.droppedVideoFrames;
    }

    // 2. Búfer Acumulado
    if (videoElem.buffered && videoElem.buffered.length > 0) {
      const curr = videoElem.currentTime;
      let bufEnd = 0;
      for (let i = 0; i < videoElem.buffered.length; i++) {
        if (videoElem.buffered.start(i) <= curr && curr <= videoElem.buffered.end(i)) {
          bufEnd = videoElem.buffered.end(i);
          break;
        }
      }
      telemetryState.bufferSeconds = Math.max(0, parseFloat((bufEnd - curr).toFixed(2)));
    } else {
      telemetryState.bufferSeconds = 0;
    }

    // 3. Resolución
    if (videoElem.videoWidth && videoElem.videoHeight) {
      telemetryState.resolution = `${videoElem.videoWidth}x${videoElem.videoHeight}`;
    }

    // 4. Retraso al Vivo (HLS)
    if (activeHlsInstance && activeHlsInstance.liveSyncPosition) {
      telemetryState.liveDelaySec = Math.max(0, parseFloat((activeHlsInstance.liveSyncPosition - videoElem.currentTime).toFixed(1)));
    }

    // Actualizar DOM del HUD si está visible
    const hudFps = document.getElementById('hud-fps');
    const hudDropped = document.getElementById('hud-dropped-frames');
    const hudBuffer = document.getElementById('hud-buffer');
    const hudBufferFill = document.getElementById('hud-buffer-bar-fill');
    const hudSpeed = document.getElementById('hud-speed');
    const hudLatency = document.getElementById('hud-latency');
    const hudLiveDelay = document.getElementById('hud-live-delay');
    const hudRes = document.getElementById('hud-resolution');

    if (hudFps) {
      hudFps.textContent = `${telemetryState.currentFps} FPS`;
      hudFps.className = 'telemetry-val ' + (telemetryState.currentFps >= 50 ? 'good' : telemetryState.currentFps >= 25 ? 'warn' : 'bad');
    }
    if (hudDropped) hudDropped.textContent = `${telemetryState.droppedFrames} cuadros perdidos`;
    if (hudBuffer) {
      hudBuffer.textContent = `${telemetryState.bufferSeconds} s`;
      hudBuffer.className = 'telemetry-val ' + (telemetryState.bufferSeconds >= 3.0 ? 'good' : telemetryState.bufferSeconds >= 1.0 ? 'warn' : 'bad');
    }
    if (hudBufferFill) {
      const pct = Math.min(100, Math.round((telemetryState.bufferSeconds / 10) * 100));
      hudBufferFill.style.width = `${pct}%`;
      hudBufferFill.style.backgroundColor = telemetryState.bufferSeconds >= 3.0 ? '#53fc18' : telemetryState.bufferSeconds >= 1.0 ? '#f59e0b' : '#ef4444';
    }
    if (hudSpeed) hudSpeed.textContent = telemetryState.downloadSpeedMbps ? `${telemetryState.downloadSpeedMbps} Mbps` : '-- Mbps';
    if (hudLatency) hudLatency.textContent = `Descarga: ${telemetryState.downloadLatencyMs} ms`;
    if (hudLiveDelay) hudLiveDelay.textContent = `${telemetryState.liveDelaySec} s`;
    if (hudRes) hudRes.textContent = `Resolución: ${telemetryState.resolution}`;
  };

  const telemetryInterval = setInterval(updateTelemetryHud, 1000);

  // Botón y Atajo para abrir/cerrar HUD
  const btnStats = document.getElementById('btn-stats-movie');
  const btnHudClose = document.getElementById('btn-telemetry-close');
  const btnHudCopy = document.getElementById('btn-telemetry-copy');
  const hudElement = document.getElementById('stream-telemetry-hud');

  const toggleHud = () => {
    telemetryState.isOpen = !telemetryState.isOpen;
    if (hudElement) hudElement.style.display = telemetryState.isOpen ? 'block' : 'none';
    if (telemetryState.isOpen) updateTelemetryHud();
  };

  if (btnStats) btnStats.onclick = toggleHud;
  if (btnHudClose) btnHudClose.onclick = toggleHud;

  if (btnHudCopy) {
    btnHudCopy.onclick = () => {
      const report = [
        `=== INFORME DE RENDIMIENTO & DIAGNÓSTICO DUALSTREAM ===`,
        `Fecha: ${new Date().toISOString()}`,
        `Streamer: ${AppState.streamer || 'BlackozuTR'}`,
        `URL Video: ${url}`,
        `Estado: ${!videoElem.paused ? 'REPRODUCIENDO' : 'PAUSADO/OFFLINE'}`,
        `FPS: ${telemetryState.currentFps} FPS | Perdidos: ${telemetryState.droppedFrames}`,
        `Búfer Acumulado: ${telemetryState.bufferSeconds} s`,
        `Velocidad Fragmento: ${telemetryState.downloadSpeedMbps} Mbps (${telemetryState.downloadLatencyMs} ms)`,
        `Retraso al Vivo: ${telemetryState.liveDelaySec} s`,
        `Resolución: ${telemetryState.resolution}`,
        `Navegador: ${navigator.userAgent}`,
        `--- ÚLTIMOS EVENTOS ---`,
        ...telemetryState.events.map(e => e.text)
      ].join('\n');

      navigator.clipboard.writeText(report).then(() => {
        btnHudCopy.textContent = '✅ ¡Copiado!';
        setTimeout(() => { btnHudCopy.textContent = '📋 Copiar Reporte'; }, 2000);
      });
    };
  }

  // Atajo de teclado: Shift + D
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      toggleHud();
    }
  });

  // ==========================================
  // PROTOCOLO: HLS (.m3u8) Live Streaming
  // ==========================================
  if (isHlsStream(url)) {
    setPlayerOffline();

    let isPlayingLive = false;
    let hls = null;

    const cleanupHls = () => {
      if (hls) {
        try {
          hls.stopLoad();
          hls.detachMedia();
          hls.destroy();
        } catch (e) {}
        hls = null;
      }
      activeHlsInstance = null;
      // Forzar al navegador a descartar cualquier buffer de audio/video que haya
      // quedado del stream anterior. Sin esto, al reconectar puede "revivir" segmentos
      // viejos superpuestos con el audio en vivo (efecto eco/loop de la sesión previa).
      try {
        videoElem.removeAttribute('src');
        videoElem.load();
      } catch (e) {}
    };

    const startHlsPlayback = () => {
      if (isPlayingLive) return;
      cleanupHls();

      if (!window.Hls || !Hls.isSupported()) {
        if (videoElem.canPlayType('application/vnd.apple.mpegurl')) {
          videoElem.src = url;
          setPlayerOnline();
        }
        return;
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // Desactivado para evitar que el reproductor intente saltos de LL-HLS hacia atrás
        backBufferLength: 0,   // Descarta cualquier fragmento de audio pasado
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
        liveSyncDurationCount: 3, // Búfer seguro de 3 fragmentos (6s) para evitar micro-cortes y saltos
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetry: 10,
        nudgeOffset: 0.1,      // Siempre empujar hacia adelante al vivo, NUNCA retroceder
        maxStarvationDelay: 2,
        manifestLoadingMaxRetry: 5,
        manifestLoadingRetryDelay: 1500,
        levelLoadingMaxRetry: 5,
        levelLoadingRetryDelay: 1500,
        fragLoadingMaxRetry: 5,
        fragLoadingRetryDelay: 1000,
      });

      activeHlsInstance = hls;

      // Guardia anti-regresión: si el navegador intenta retroceder en el tiempo a un búfer viejo
      videoElem.addEventListener('seeking', () => {
        if (hls && hls.liveSyncPosition && videoElem.currentTime < hls.liveSyncPosition - 4) {
          console.warn('[DualStream Audio Sync] ⏭️ Evitando salto a audio viejo -> Reubicando en vivo...');
          videoElem.currentTime = hls.liveSyncPosition;
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        if (!isPlayingLive) {
          isPlayingLive = true;
          setPlayerOnline();
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (ev, data) => {
        if (!isPlayingLive) {
          isPlayingLive = true;
          setPlayerOnline();
        }
        const durationSec = data.frag.duration || 2;
        const loadTimeMs = Math.round(data.stats.loading.end - data.stats.loading.start);
        const bytes = data.stats.total || 0;
        const mbps = loadTimeMs > 0 ? parseFloat(((bytes * 8) / (loadTimeMs / 1000) / 1000000).toFixed(2)) : 0;

        telemetryState.downloadSpeedMbps = mbps;
        telemetryState.downloadLatencyMs = loadTimeMs;
        addTelemetryLog(`Fragmento #${data.frag.sn} (${durationSec}s) cargado en ${loadTimeMs}ms (${mbps} Mbps)`, 'success');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const isStreamCutoff = (
          data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR || 
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
          (data.response && data.response.code === 404) ||
          data.fatal
        );

        if (isStreamCutoff) {
          isPlayingLive = false;
          setPlayerOffline();
          cleanupHls();
        }
      });

      videoElem.addEventListener('ended', () => {
        isPlayingLive = false;
        setPlayerOffline();
        cleanupHls();
      });

      hls.attachMedia(videoElem);
      hls.loadSource(url);
    };

    hlsRetryFn = startHlsPlayback;

    if (AppState.isOnline) {
      startHlsPlayback();
    }
  } else {
    videoElem.src = url;
  }

  let initialSynced = false;
  const syncInitialTime = () => {
    if (initialSynced) return;
    if (!AppState.isAdmin && initialSyncState && !isHlsStream(url)) {
      initialSynced = true;
      const latency = Math.max(0, (Date.now() - (initialSyncState.updatedAt || Date.now())) / 1000);
      const target = (initialSyncState.currentTime || 0) + (initialSyncState.isPlaying ? latency : 0);
      if (target > 0) {
        try { videoElem.currentTime = target; } catch(e) {}
      }
      if (initialSyncState.isPlaying) {
        videoElem.play().catch(() => {});
      } else {
        videoElem.pause();
      }
    }
  };

  videoElem.addEventListener('loadedmetadata', syncInitialTime, { once: true });
  videoElem.addEventListener('canplay', syncInitialTime, { once: true });

  if (AppState.isAdmin) {
    videoElem.addEventListener('play', () => {
      if (!isHlsStream(url) && typeof playbackSyncEmitter === 'function') playbackSyncEmitter(videoElem.currentTime, true);
    });
    videoElem.addEventListener('pause', () => {
      if (!isHlsStream(url) && typeof playbackSyncEmitter === 'function') playbackSyncEmitter(videoElem.currentTime, false);
    });
    videoElem.addEventListener('seeked', () => {
      if (!isHlsStream(url) && typeof playbackSyncEmitter === 'function') playbackSyncEmitter(videoElem.currentTime, !videoElem.paused);
    });
  }
}

export function renderIframeVideo(embedUrl) {
  const iframe = document.createElement('iframe');
  iframe.className = 'media-frame';
  iframe.id = 'movie-iframe-player';
  iframe.src = embedUrl;
  iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; display-capture');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  iframe.setAttribute('title', 'Movie Player');

  const wrapper = document.getElementById('movie-media-wrapper') || DOM.movieMediaWrapper;
  if (wrapper) wrapper.appendChild(iframe);
}

export function loadVideoSource(rawInput, initialSyncState = null) {
  if (!rawInput || rawInput.trim() === '') {
    unloadVideo();
    return;
  }

  let url = rawInput.trim();

  const iframeSrcMatch = url.match(/<iframe.*?src=["'](.*?)["']/i);
  if (iframeSrcMatch && iframeSrcMatch[1]) {
    url = iframeSrcMatch[1];
  }

  if (activeNativeVideo && activeNativeVideo.dataset.url === url && isHlsStream(url)) {
    return;
  }

  AppState.videoUrl = url;
  syncUrlParams();

  if (activeHlsInstance) {
    try {
      activeHlsInstance.stopLoad();
      activeHlsInstance.detachMedia();
      activeHlsInstance.destroy();
    } catch (e) {}
    activeHlsInstance = null;
  }
  if (activeNativeVideo) {
    try {
      activeNativeVideo.pause();
      activeNativeVideo.removeAttribute('src');
      activeNativeVideo.load();
    } catch (e) {}
    activeNativeVideo = null;
  }

  const wrapper = document.getElementById('movie-media-wrapper') || DOM.movieMediaWrapper;
  if (wrapper) wrapper.innerHTML = '';
  if (ytPlayerInstance && typeof ytPlayerInstance.destroy === 'function') {
    try { ytPlayerInstance.destroy(); } catch (e) {}
    ytPlayerInstance = null;
  }

  const ytId = extractYouTubeId(url);

  if (ytId) {
    const ytContainer = document.createElement('div');
    ytContainer.id = 'yt-player-target';
    ytContainer.className = 'media-frame';
    if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.appendChild(ytContainer);

    if (window.YT && window.YT.Player) {
      initYouTubePlayer(ytId, initialSyncState);
    } else {
      pendingYtVideoId = ytId;
    }
  } else if (isDirectVideoFile(url)) {
    renderNativeVideo(url, initialSyncState);
  } else {
    renderIframeVideo(url);
  }

  if (DOM.moviePlaceholder) DOM.moviePlaceholder.style.display = 'none';
  if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.style.display = 'block';

  updateVideoInfoBadge(url);
}

export function unloadVideo() {
  if (activeHlsInstance) {
    try { activeHlsInstance.destroy(); } catch (e) {}
    activeHlsInstance = null;
  }
  if (activeHlsPoller) {
    clearInterval(activeHlsPoller);
    activeHlsPoller = null;
  }
  hlsRetryFn = null;
  AppState.videoUrl = '';
  syncUrlParams();
  if (DOM.movieMediaWrapper) {
    DOM.movieMediaWrapper.innerHTML = '';
    DOM.movieMediaWrapper.style.display = 'none';
  }
  if (DOM.moviePlaceholder) DOM.moviePlaceholder.style.display = 'flex';
  if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = 'Sin video cargado';
}

export function updateVideoInfoBadge(url) {
  let hostname = 'Fuente externa';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace('www.', '');
  } catch (e) {
    hostname = 'Video cargado';
  }
  if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = hostname;
}

export function unlockViewerMobileAudio(latestSyncState) {
  const banner = document.getElementById('mobile-sync-unlock-banner');
  if (banner) banner.classList.add('hidden');

  if (ytPlayerInstance && typeof ytPlayerInstance.unMute === 'function') {
    try {
      ytPlayerInstance.unMute();
      ytPlayerInstance.setVolume(100);
      if (latestSyncState && latestSyncState.isPlaying) {
        const latency = Math.max(0, (Date.now() - latestSyncState.updatedAt) / 1000);
        ytPlayerInstance.seekTo((latestSyncState.currentTime || 0) + latency, true);
        ytPlayerInstance.playVideo();
      } else if (latestSyncState) {
        ytPlayerInstance.seekTo(latestSyncState.currentTime || 0, true);
        ytPlayerInstance.pauseVideo();
      } else {
        ytPlayerInstance.playVideo();
      }
    } catch (e) {}
  }

  if (activeNativeVideo) {
    try {
      activeNativeVideo.muted = false;
      if (latestSyncState && latestSyncState.isPlaying) {
        activeNativeVideo.play().catch(() => {});
      }
    } catch (e) {}
  }

  showToast('🔊 ¡Watch Party sincronizada con audio!', 'success');
}

export function updateVideoVolume(val) {
  const vol = Math.max(0, Math.min(100, parseInt(val, 10)));
  const iconVolHigh = document.getElementById('icon-vol-high');
  const iconVolMute = document.getElementById('icon-vol-mute');

  const nativeVid = DOM.movieMediaWrapper ? DOM.movieMediaWrapper.querySelector('video') : activeNativeVideo;
  if (nativeVid) {
    if (vol > 0) {
      nativeVid.muted = false;
      nativeVid.volume = vol / 100;
    } else {
      nativeVid.muted = true;
      nativeVid.volume = 0;
    }
  }

  if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
    try {
      ytPlayerInstance.setVolume(vol);
      if (vol === 0) {
        ytPlayerInstance.mute();
      } else {
        ytPlayerInstance.unMute();
      }
    } catch (e) {}
  }

  const iframeVid = DOM.movieMediaWrapper ? DOM.movieMediaWrapper.querySelector('iframe') : null;
  if (iframeVid && iframeVid.contentWindow) {
    try {
      iframeVid.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [vol] }), '*');
      if (vol > 0) iframeVid.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
    } catch (e) {}
  }

  if (vol === 0) {
    if (iconVolHigh) iconVolHigh.classList.add('hidden');
    if (iconVolMute) iconVolMute.classList.remove('hidden');
  } else {
    if (iconVolHigh) iconVolHigh.classList.remove('hidden');
    if (iconVolMute) iconVolMute.classList.add('hidden');
  }
}

export function toggleFullscreen(element) {
  if (!element) return;
  if (!document.fullscreenElement) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

export async function reloadMoviePlayer(getLatestSync) {
  showToast('Sincronizando con el streamer...', 'info');
  try {
    const res = await fetchLatestCloudState();
    if (res.ok) {
      const cloudState = await res.json();
      if (cloudState) {
        if (cloudState.videoUrl) AppState.videoUrl = cloudState.videoUrl;
      }
    }
  } catch (e) {}

  if (!AppState.videoUrl) {
    showToast('No hay video cargado', 'info');
    return;
  }

  loadVideoSource(AppState.videoUrl, getLatestSync ? getLatestSync() : null);
  showToast('¡Reproductor resincronizado con el streamer!', 'success');
}
