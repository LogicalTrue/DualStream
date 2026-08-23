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

export function isDirectVideoFile(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.endsWith('.mp4') || 
    cleanUrl.endsWith('.webm') || 
    cleanUrl.endsWith('.ogg') || 
    cleanUrl.endsWith('.mkv') || 
    cleanUrl.endsWith('.m3u8') ||
    cleanUrl.includes('.m3u8?') ||
    cleanUrl.includes('.mp4?') ||
    cleanUrl.includes('blob.vercel-storage') ||
    cleanUrl.includes('catbox.moe');
}

export function isHlsStream(url) {
  if (!url) return false;
  const cleanUrl = url.toLowerCase().split('?')[0];
  return cleanUrl.endsWith('.m3u8') || cleanUrl.includes('.m3u8?');
}

export let activeHlsInstance = null;

export function renderNativeVideo(url, initialSyncState = null) {
  // Destruir instancia previa de HLS si existía
  if (activeHlsInstance) {
    try { activeHlsInstance.destroy(); } catch (e) {}
    activeHlsInstance = null;
  }

  const videoElem = document.createElement('video');
  videoElem.className = 'native-video-player';
  videoElem.controls = AppState.isAdmin;
  videoElem.autoplay = true;
  videoElem.playsInline = true;
  videoElem.setAttribute('playsinline', 'true');
  videoElem.setAttribute('webkit-playsinline', 'true');
  videoElem.preload = 'auto';
  videoElem.volume = 1.0;
  videoElem.muted = false;

  // Si el navegador bloquea autoplay con sonido, arrancamos muteado y desmuteamos al primer toque
  const enableSoundOnInteraction = () => {
    videoElem.muted = false;
    videoElem.volume = 1.0;
    updateVideoVolume(100);
  };
  videoElem.addEventListener('click', enableSoundOnInteraction);
  document.addEventListener('click', enableSoundOnInteraction, { once: true });

  activeNativeVideo = videoElem;

  // Soporte HLS en vivo (OBS / m3u8) - Transmisión en tiempo real 60 FPS fluida y continua
  if (isHlsStream(url) && window.Hls && Hls.isSupported()) {
    let isLive = false;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      maxBufferLength: 20,
      maxMaxBufferLength: 40,
      backBufferLength: 0,
      liveDurationInfinity: true,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: Infinity,
      manifestLoadingRetryDelay: 1500,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: Infinity,
      levelLoadingRetryDelay: 1500
    });

    let reconnectInterval = null;

    const setPlayerOffline = () => {
      isLive = false;
      try {
        videoElem.pause();
        videoElem.removeAttribute('src');
        videoElem.load();
      } catch(e) {}

      if (DOM.theaterOfflineScreen) DOM.theaterOfflineScreen.style.display = 'flex';
      if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.style.display = 'none';
      if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = 'Stream Fuera de Línea';

      if (!reconnectInterval) {
        reconnectInterval = setInterval(() => {
          if (isLive) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
            return;
          }
          try {
            hls.loadSource(url);
          } catch(e) {}
        }, 1500);
      }
    };

    const setPlayerOnline = () => {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      isLive = true;
      if (DOM.theaterOfflineScreen) DOM.theaterOfflineScreen.style.display = 'none';
      if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.style.display = 'block';
      if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = 'En Vivo';

      const playPromise = videoElem.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          videoElem.muted = true;
          videoElem.play().catch(() => {});
        });
      }
    };

    hls.on(Hls.Events.MANIFEST_PARSED, setPlayerOnline);
    hls.on(Hls.Events.LEVEL_LOADED, setPlayerOnline);
    hls.on(Hls.Events.FRAG_LOADED, setPlayerOnline);

    hls.on(Hls.Events.ERROR, (event, data) => {
      const is404 = (data.response && (data.response.code === 404 || data.response.code === 0)) ||
                    (data.details && data.details.includes('404')) ||
                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                    data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR;

      // Si OBS se apaga, cortar el cuadro congelado y pasar al cartel offline al instante
      if (is404 || data.fatal) {
        setPlayerOffline();
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        }
      }
    });

    hls.loadSource(url);
    hls.attachMedia(videoElem);

    activeHlsInstance = hls;
  } else if (isHlsStream(url) && videoElem.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari nativo para HLS
    videoElem.src = url;
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

  if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.appendChild(videoElem);
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

  if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.appendChild(iframe);
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

  AppState.videoUrl = url;
  syncUrlParams();

  if (DOM.movieMediaWrapper) DOM.movieMediaWrapper.innerHTML = '';
  activeNativeVideo = null;
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
