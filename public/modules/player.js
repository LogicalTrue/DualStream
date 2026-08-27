import { DOM } from './dom.js';
import { AppState } from './state.js';
import { showToast } from './ui.js';
import { fetchLatestCloudState } from './api.js';

export let activeNativeVideo = null;
export let ytPlayerInstance = null;
export let isYtApiReady = (typeof window !== 'undefined' && typeof YT !== 'undefined' && YT.loaded);
export let pendingYtVideoId = null;

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
        controls: 1,
        playsinline: 1,
        rel: 0,
        enablejsapi: 1
      },
      events: {
        onReady: (e) => {
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

export function isOvenStream(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.startsWith('ws://') || 
         cleanUrl.startsWith('wss://') || 
         cleanUrl.endsWith('/webrtc');
}

export function isHlsStream(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.endsWith('.m3u8') || 
         cleanUrl.includes('.m3u8?') || 
         cleanUrl.includes('llhls.m3u8') ||
         cleanUrl.includes('playlist.m3u8');
}

export function isDirectVideoFile(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return isWhepStream(url) ||
    isOvenStream(url) ||
    isHlsStream(url) ||
    cleanUrl.endsWith('.mp4') || 
    cleanUrl.endsWith('.webm') || 
    cleanUrl.endsWith('.ogg') || 
    cleanUrl.endsWith('.mkv') ||
    cleanUrl.includes('.mp4?') ||
    cleanUrl.includes('blob.vercel-storage');
}

export let activeOvenPlayer = null;
export let activeHlsInstance = null;
export let activeHlsPoller = null;
export let activeWhepPc = null;
export let whepReconnectTimer = null;
export let hlsRetryFn = null;

export const telemetryState = {
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

export const addTelemetryLog = (msg, type = 'info') => {
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

export const updateTelemetryHud = () => {
  const activeVideo = document.querySelector('#ovenplayer-target video') || document.getElementById('main-theater-video') || activeNativeVideo;

  if (activeVideo && typeof activeVideo.getVideoPlaybackQuality === 'function') {
    const q = activeVideo.getVideoPlaybackQuality();
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

  if (activeVideo && activeVideo.buffered && activeVideo.buffered.length > 0) {
    const curr = activeVideo.currentTime;
    let bufEnd = 0;
    for (let i = 0; i < activeVideo.buffered.length; i++) {
      if (activeVideo.buffered.start(i) <= curr && curr <= activeVideo.buffered.end(i)) {
        bufEnd = activeVideo.buffered.end(i);
        break;
      }
    }
    telemetryState.bufferSeconds = Math.max(0, parseFloat((bufEnd - curr).toFixed(2)));
    
    // El retraso real al vivo es la distancia entre el final del buffer recibido y lo que estás reproduciendo
    if (activeHlsInstance && activeHlsInstance.liveSyncPosition) {
      telemetryState.liveDelaySec = Math.max(0, parseFloat((activeHlsInstance.liveSyncPosition - curr).toFixed(1)));
    } else {
      const maxBuffered = activeVideo.buffered.end(activeVideo.buffered.length - 1);
      telemetryState.liveDelaySec = Math.max(0, parseFloat((maxBuffered - curr).toFixed(1)));
    }
  } else {
    telemetryState.bufferSeconds = 0;
    telemetryState.liveDelaySec = 0;
  }

  if (activeVideo && activeVideo.videoWidth && activeVideo.videoHeight) {
    telemetryState.resolution = `${activeVideo.videoWidth}x${activeVideo.videoHeight}`;
  }

  if (activeOvenPlayer) {
    telemetryState.liveDelaySec = 0.3;
  }

  let ramMbText = '-- MB';
  let ramLimitText = 'Límite: -- MB';
  let rawRamNum = 0;
  if (window.performance && performance.memory) {
    rawRamNum = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
    const totalMb = Math.round(performance.memory.totalJSHeapSize / (1024 * 1024));
    const limitMb = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
    ramMbText = `${rawRamNum} MB`;
    ramLimitText = `Total: ${totalMb} MB / Máx: ${limitMb} MB`;
  } else if (navigator.deviceMemory) {
    ramMbText = `${navigator.deviceMemory} GB RAM`;
    ramLimitText = 'Navegador Safari / WebKit';
  }

  let connText = 'Red: 4G / 5G / WiFi';
  if (navigator.connection) {
    const conn = navigator.connection;
    const type = conn.effectiveType ? conn.effectiveType.toUpperCase() : 'WIFI';
    const rtt = conn.rtt ? `${conn.rtt}ms RTT` : '';
    connText = `Red: ${type} ${rtt}`.trim();
  }

  const hudFps = document.getElementById('hud-fps');
  const hudDropped = document.getElementById('hud-dropped-frames');
  const hudBuffer = document.getElementById('hud-buffer');
  const hudBufferFill = document.getElementById('hud-buffer-bar-fill');
  const hudSpeed = document.getElementById('hud-speed');
  const hudLatency = document.getElementById('hud-latency');
  const hudLiveDelay = document.getElementById('hud-live-delay');
  const hudRes = document.getElementById('hud-resolution');
  const hudRam = document.getElementById('hud-ram');
  const hudRamLimit = document.getElementById('hud-ram-limit');
  const hudConnType = document.getElementById('hud-connection-type');
  const hudCdnStatus = document.getElementById('hud-cdn-status');

  if (hudFps) {
    hudFps.textContent = `${telemetryState.currentFps} FPS`;
    hudFps.className = 'telemetry-val ' + (telemetryState.currentFps >= 50 ? 'good' : telemetryState.currentFps >= 25 ? 'warn' : 'bad');
  }
  if (hudDropped) hudDropped.textContent = `${telemetryState.droppedFrames} cuadros perdidos`;
  if (hudBuffer) {
    hudBuffer.textContent = `${telemetryState.bufferSeconds} s`;
    hudBuffer.className = 'telemetry-val ' + (telemetryState.bufferSeconds >= 2.0 ? 'good' : telemetryState.bufferSeconds >= 1.0 ? 'warn' : 'bad');
  }
  if (hudBufferFill) {
    const pct = Math.min(100, Math.round((telemetryState.bufferSeconds / 6) * 100));
    hudBufferFill.style.width = `${pct}%`;
    hudBufferFill.style.backgroundColor = telemetryState.bufferSeconds >= 2.0 ? '#53fc18' : '#f59e0b';
  }
  if (hudRam) {
    hudRam.textContent = ramMbText;
    hudRam.className = 'telemetry-val ' + (rawRamNum > 0 && rawRamNum < 45 ? 'good' : rawRamNum < 100 ? 'warn' : 'bad');
  }
  if (hudRamLimit) hudRamLimit.textContent = ramLimitText;
  if (hudSpeed) hudSpeed.textContent = telemetryState.downloadSpeedMbps ? `${telemetryState.downloadSpeedMbps} Mbps` : '-- Mbps';
  if (hudLatency) hudLatency.textContent = `Descarga: ${telemetryState.downloadLatencyMs} ms`;
  if (hudLiveDelay) hudLiveDelay.textContent = `${telemetryState.liveDelaySec} s`;
  if (hudRes) hudRes.textContent = `Resolución: ${telemetryState.resolution}`;
  if (hudConnType) hudConnType.textContent = connText;
  if (hudCdnStatus) {
    hudCdnStatus.textContent = 'Hetzner Origin USA (LL-HLS)';
    hudCdnStatus.style.color = '#53fc18';
  }
};

if (typeof window !== 'undefined') {
  setInterval(() => {
    updateTelemetryHud();

    // Motor de aceleración inteligente LiveSync (estilo MiluLive)
    const activeVideo = document.querySelector('#ovenplayer-target video') || document.getElementById('main-theater-video') || activeNativeVideo;
    if (activeVideo && !activeVideo.paused) {
      if (activeHlsInstance && activeHlsInstance.liveSyncPosition) {
        const liveGap = activeHlsInstance.liveSyncPosition - activeVideo.currentTime;
        if (liveGap > 4.5) {
          activeVideo.playbackRate = 1.15; // Acelera suavemente un 15% para volver al rango de 3s
        } else if (liveGap <= 3.0) {
          activeVideo.playbackRate = 1.0; // Velocidad normal
        }
      }
    }
  }, 1000);
}

export let ovenRetryTimer = null;

export function renderOvenPlayer(url) {
  if (ovenRetryTimer) {
    clearTimeout(ovenRetryTimer);
    ovenRetryTimer = null;
  }

  if (activeOvenPlayer) {
    try { activeOvenPlayer.remove(); } catch(e) {}
    activeOvenPlayer = null;
  }
  const wrapper = document.getElementById('movie-media-wrapper') || DOM.movieMediaWrapper;
  if (wrapper) wrapper.innerHTML = '';

  const ovenContainer = document.createElement('div');
  ovenContainer.id = 'ovenplayer-target';
  ovenContainer.style.width = '100%';
  ovenContainer.style.height = '100%';
  if (wrapper) wrapper.appendChild(ovenContainer);

  const setPlayerOffline = () => {
    document.body.classList.add('viewer-standby');
    const offlineScreen = document.getElementById('theater-offline-screen');
    const mediaWrapper = document.getElementById('movie-media-wrapper');
    if (offlineScreen) offlineScreen.style.setProperty('display', 'flex', 'important');
    if (mediaWrapper) mediaWrapper.style.setProperty('display', 'none', 'important');

    if (!ovenRetryTimer) {
      ovenRetryTimer = setTimeout(() => {
        ovenRetryTimer = null;
        renderOvenPlayer(url);
      }, 2500);
    }
  };

  const setPlayerOnline = () => {
    if (ovenRetryTimer) {
      clearTimeout(ovenRetryTimer);
      ovenRetryTimer = null;
    }
    document.body.classList.remove('viewer-standby');
    const offlineScreen = document.getElementById('theater-offline-screen');
    const mediaWrapper = document.getElementById('movie-media-wrapper');
    if (offlineScreen) offlineScreen.style.setProperty('display', 'none', 'important');
    if (mediaWrapper) mediaWrapper.style.setProperty('display', 'block', 'important');
  };

  setPlayerOffline();

  if (typeof window.OvenPlayer === 'undefined') {
    return;
  }

  const webrtcUrl = url.replace('https://', 'wss://').replace('http://', 'ws://').replace('/llhls.m3u8', '').replace('/playlist.m3u8', '');
  const llhlsUrl = url.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/app\/stream\/?$/, '/app/stream/llhls.m3u8');
  const hlsUrl = url.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/app\/stream\/?$/, '/app/stream/playlist.m3u8');

  activeOvenPlayer = OvenPlayer.create('ovenplayer-target', {
    sources: [
      {
        label: 'LL-HLS CDN (Ultra Estable)',
        type: 'llhls',
        file: llhlsUrl
      },
      {
        label: 'HLS Estándar',
        type: 'hls',
        file: hlsUrl
      }
    ],
    autoStart: true,
    autoFallback: true,
    mute: true,
    controls: false,
    showBigPlayButton: false,
    hlsConfig: {
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 5,
      maxBufferLength: 4,
      maxMaxBufferLength: 8
    }
  });

  activeOvenPlayer.on('ready', () => {
    try { activeOvenPlayer.play(); } catch(e) {}
  });

  activeOvenPlayer.on('stateChanged', (state) => {
    if (state.newstate === 'playing') {
      setPlayerOnline();
    } else if (state.newstate === 'error' || state.newstate === 'idle') {
      setPlayerOffline();
    }
  });

  activeOvenPlayer.on('error', () => {
    setPlayerOffline();
  });
}

if (typeof window !== 'undefined' && !window._soundInteractionRegistered) {
  window._soundInteractionRegistered = true;
  const onFirstInteraction = () => {
    if (activeOvenPlayer) {
      try {
        activeOvenPlayer.setMute(false);
        activeOvenPlayer.setVolume(100);
        activeOvenPlayer.play();
      } catch (e) {}
    }
    const v = document.getElementById('main-theater-video');
    if (v) {
      v.muted = false;
      v.volume = 1.0;
      updateVideoVolume(100);
      v.play().catch(() => {});
    }
  };
  document.addEventListener('click', onFirstInteraction, { once: true });
  document.addEventListener('touchstart', onFirstInteraction, { once: true });
}

export function renderNativeVideo(url, initialSyncState = null) {
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

  let videoElem = document.getElementById('main-theater-video');
  if (!videoElem) {
    videoElem = document.createElement('video');
    videoElem.id = 'main-theater-video';
    videoElem.className = 'native-video-player';
  }

  document.querySelectorAll('video, audio').forEach(el => {
    if (el !== videoElem) {
      try { el.pause(); el.removeAttribute('src'); el.load(); } catch(e) {}
      el.remove();
    }
  });

  videoElem.controls = false;
  videoElem.autoplay = true;
  videoElem.playsInline = true;
  videoElem.setAttribute('playsinline', 'true');
  videoElem.setAttribute('webkit-playsinline', 'true');
  videoElem.preload = 'auto';
  videoElem.volume = 1.0;
  videoElem.dataset.url = url;
  
  videoElem.addEventListener('webkitbeginfullscreen', () => {
    document.body.classList.add('is-fullscreen');
    const floatChatBtn = document.getElementById('btn-floating-chat-toggle');
    if (floatChatBtn) floatChatBtn.style.setProperty('display', 'none', 'important');
  });
  videoElem.addEventListener('webkitendfullscreen', () => {
    document.body.classList.remove('is-fullscreen');
    const floatChatBtn = document.getElementById('btn-floating-chat-toggle');
    if (floatChatBtn) floatChatBtn.style.removeProperty('display');
  });

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
      playPromise.then(() => {}).catch(() => {
        videoElem.muted = true;
        videoElem.play().catch(() => {});
      });
    }
  };

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
        lowLatencyMode: true,
        progressive: true,
        backBufferLength: 10,
        maxBufferSize: 30 * 1024 * 1024,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        liveSyncDuration: 3.0,            // 🎯 Punto dulce: 3.0s de latencia con buffer estable
        liveMaxLatencyDuration: 5.0,      // Si el lag supera 5s, activa aceleración progresiva
        maxLiveSyncPlaybackRate: 1.15,    // Aceleración suave del 15% (imperceptible, sin corte de audio)
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 2,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 400,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 400,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 400,
      });

      activeHlsInstance = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoElem.play().catch(() => {});
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
        const durationSec = data.frag.duration || 1;
        const loadTimeMs = Math.round(data.stats.loading.end - data.stats.loading.start);
        const bytes = data.stats.total || 0;
        const mbps = loadTimeMs > 0 ? parseFloat(((bytes * 8) / (loadTimeMs / 1000) / 1000000).toFixed(2)) : 0;

        telemetryState.downloadSpeedMbps = mbps;
        telemetryState.downloadLatencyMs = loadTimeMs;
        addTelemetryLog(`Fragmento #${data.frag.sn} cargado en ${loadTimeMs}ms (${mbps} Mbps)`, 'success');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          try {
            hls.startLoad();
            if (videoElem.paused) {
              videoElem.play().catch(() => {});
            }
            if (hls.liveSyncPosition && Math.abs(hls.liveSyncPosition - videoElem.currentTime) > 3.0) {
              videoElem.currentTime = hls.liveSyncPosition - 1.5;
            }
          } catch (e) {}
          return;
        }

        if (data.details === Hls.ErrorDetails.BUFFER_FULL_ERROR) {
          try {
            hls.cleanBuffer(0, Math.max(0, videoElem.currentTime - 5));
          } catch (e) {}
          return;
        }

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              try {
                hls.startLoad();
              } catch (e) {
                scheduleAutoReconnect();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              try {
                hls.recoverMediaError();
              } catch (e) {
                scheduleAutoReconnect();
              }
              break;
            default:
              scheduleAutoReconnect();
              break;
          }
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (videoElem.paused && isPlayingLive) {
            videoElem.play().catch(() => {});
          }
          if (activeHlsInstance && activeHlsInstance.liveSyncPosition) {
            const lag = activeHlsInstance.liveSyncPosition - videoElem.currentTime;
            if (lag > 4) {
              videoElem.currentTime = activeHlsInstance.liveSyncPosition;
            }
          }
          if (!isPlayingLive) {
            startHlsPlayback();
          }
        }
      });

      window.addEventListener('online', () => {
        if (activeHlsInstance) {
          try { activeHlsInstance.startLoad(); } catch(e) {}
        }
        startHlsPlayback();
      });

      hls.attachMedia(videoElem);
      hls.loadSource(url);
    };

    let autoReconnectTimer = null;
    const scheduleAutoReconnect = () => {
      if (autoReconnectTimer) return;
      isPlayingLive = false;
      setPlayerOffline();
      cleanupHls();

      autoReconnectTimer = setInterval(async () => {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) {
            clearInterval(autoReconnectTimer);
            autoReconnectTimer = null;
            startHlsPlayback();
          }
        } catch (e) {}
      }, 2500);
    };

    hlsRetryFn = startHlsPlayback;
    startHlsPlayback();
  } else {
    videoElem.src = url;
  }

  let initialSynced = false;
  const syncInitialTime = () => {
    if (initialSynced) return;
    if (initialSyncState && !isHlsStream(url)) {
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
  } else if (isOvenStream(url)) {
    renderOvenPlayer(url);
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
  if (activeOvenPlayer) {
    try { activeOvenPlayer.remove(); } catch (e) {}
    activeOvenPlayer = null;
  }
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

  if (activeOvenPlayer) {
    try {
      activeOvenPlayer.setMute(false);
      activeOvenPlayer.setVolume(100);
      activeOvenPlayer.play();
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

  if (activeOvenPlayer && typeof activeOvenPlayer.setVolume === 'function') {
    try {
      activeOvenPlayer.setVolume(vol);
      if (vol === 0) {
        activeOvenPlayer.setMute(true);
      } else {
        activeOvenPlayer.setMute(false);
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
  if (!element) element = document.getElementById('stage-section') || document.body;
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  const floatChatBtn = document.getElementById('btn-floating-chat-toggle');
  const nativeVid = document.getElementById('main-theater-video');

  if (!isFs) {
    document.body.classList.add('is-fullscreen');
    element.classList.add('is-fullscreen');
    if (floatChatBtn) {
      floatChatBtn.classList.add('hidden');
      floatChatBtn.style.setProperty('display', 'none', 'important');
    }

    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }

    const reqTarget = element.requestFullscreen ? element : (nativeVid || element);
    if (reqTarget.requestFullscreen) {
      reqTarget.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }).catch(() => {
        if (nativeVid && nativeVid.webkitEnterFullscreen) nativeVid.webkitEnterFullscreen();
      });
    } else if (reqTarget.webkitRequestFullscreen) {
      reqTarget.webkitRequestFullscreen();
    } else if (nativeVid && nativeVid.webkitEnterFullscreen) {
      nativeVid.webkitEnterFullscreen();
    } else if (reqTarget.msRequestFullscreen) {
      reqTarget.msRequestFullscreen();
    }
  } else {
    document.body.classList.remove('is-fullscreen');
    element.classList.remove('is-fullscreen');
    if (floatChatBtn) {
      floatChatBtn.classList.remove('hidden');
      floatChatBtn.style.removeProperty('display');
    }

    if (screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch(e) {}
    }

    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

if (typeof document !== 'undefined') {
  const syncFullscreenClass = () => {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    const floatChatBtn = document.getElementById('btn-floating-chat-toggle');
    const stageSec = document.getElementById('stage-section');

    if (isFs) {
      document.body.classList.add('is-fullscreen');
      if (stageSec) stageSec.classList.add('is-fullscreen');
      if (floatChatBtn) {
        floatChatBtn.classList.add('hidden');
        floatChatBtn.style.setProperty('display', 'none', 'important');
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      document.body.classList.remove('is-fullscreen');
      if (stageSec) stageSec.classList.remove('is-fullscreen');
      if (floatChatBtn) {
        floatChatBtn.classList.remove('hidden');
        floatChatBtn.style.removeProperty('display');
      }
      if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch(e) {}
      }
    }
  };

  document.addEventListener('fullscreenchange', syncFullscreenClass);
  document.addEventListener('webkitfullscreenchange', syncFullscreenClass);
  document.addEventListener('msfullscreenchange', syncFullscreenClass);
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
