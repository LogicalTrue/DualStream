import { DOM } from './modules/dom.js';
import { AppState, sanitizeStreamerName } from './modules/state.js';
import { fetchLatestCloudState } from './modules/api.js';
import { updateKickViews, reloadKickChat } from './modules/kick.js';
import { STREAM_CONFIG } from './stream-config.js';
import {
  loadVideoSource,
  unloadVideo,
  unlockViewerMobileAudio,
  updateVideoVolume,
  unmuteStream,
  toggleFullscreen,
  reloadMoviePlayer,
  ytPlayerInstance,
  activeNativeVideo
} from './modules/player.js';
import {
  showToast,
  parseUrlParams,
  toggleFullscreen as toggleFs,
  toggleChatColumn,
  openChat,
  closeChat,
  initChatResizer
} from './modules/ui.js';
import {
  initRealtimeSyncListener,
  latestSyncPlaybackState,
  getLatestSyncState
} from './modules/sync.js';

function initEventListeners() {
  const unmuteOverlay = document.getElementById('unmute-floating-overlay');
  if (unmuteOverlay) {
    const handleOverlayTap = (e) => {
      if (e) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      unmuteStream();
    };

    unmuteOverlay.addEventListener('click', handleOverlayTap);
    unmuteOverlay.addEventListener('touchend', handleOverlayTap);
    unmuteOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        unmuteStream();
      }
    });
  }

  const moviePlayerBox = document.getElementById('movie-player-box');
  if (moviePlayerBox) {
    moviePlayerBox.addEventListener('click', (e) => {
      if (e && e.target && e.target.closest && (
        e.target.closest('#floating-video-controls') || 
        e.target.closest('.control-badge-btn')
      )) {
        return;
      }
      const overlay = document.getElementById('unmute-floating-overlay');
      if (overlay && overlay.style.display !== 'none' && !overlay.classList.contains('fade-out')) {
        unmuteStream();
      }
    });
  }

  const btnToggleVideoMute = document.getElementById('btn-toggle-video-mute');
  const sliderVideoVolume = document.getElementById('slider-video-volume');
  const btnReloadMovie = document.getElementById('btn-reload-movie');

  if (sliderVideoVolume) {
    ['input', 'change', 'touchmove'].forEach(evt => {
      sliderVideoVolume.addEventListener(evt, (e) => {
        updateVideoVolume(e.target.value);
      });
    });
  }

  if (btnToggleVideoMute) {
    btnToggleVideoMute.addEventListener('click', () => {
      const nativeVid = DOM.movieMediaWrapper ? DOM.movieMediaWrapper.querySelector('video') : activeNativeVideo;
      const currentSliderVal = sliderVideoVolume ? parseInt(sliderVideoVolume.value, 10) : 100;

      if (currentSliderVal === 0 || (nativeVid && nativeVid.muted)) {
        if (sliderVideoVolume) sliderVideoVolume.value = 100;
        updateVideoVolume(100);
      } else {
        if (sliderVideoVolume) sliderVideoVolume.value = 0;
        updateVideoVolume(0);
      }
    });
  }

  if (btnReloadMovie) {
    btnReloadMovie.addEventListener('click', () => {
      if (AppState.videoUrl) {
        loadVideoSource(AppState.videoUrl);
      }
    });
  }

  if (DOM.btnFullscreenMovie) {
    DOM.btnFullscreenMovie.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFs(DOM.stageSection || document.getElementById('stage-section'));
    });
  }

  if (DOM.btnReloadChat) DOM.btnReloadChat.addEventListener('click', reloadKickChat);
  if (DOM.btnToggleChat) DOM.btnToggleChat.addEventListener('click', toggleChatColumn);
  if (DOM.btnReopenChat) DOM.btnReopenChat.addEventListener('click', toggleChatColumn);
  if (DOM.btnCloseChatMobile) DOM.btnCloseChatMobile.addEventListener('click', toggleChatColumn);

  if (DOM.btnConnectWatchparty) {
    DOM.btnConnectWatchparty.addEventListener('click', () => {
      AppState.isViewerConnected = true;
      document.body.classList.remove('viewer-standby');
      if (DOM.theaterOnlineScreen) DOM.theaterOnlineScreen.style.display = 'none';

      updateKickViews();

      if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
        loadVideoSource(AppState.videoUrl, getLatestSyncState());
      }

      unlockViewerMobileAudio(getLatestSyncState());
    });
  }

  const btnFloatingChat = document.getElementById('btn-floating-chat-toggle');
  if (btnFloatingChat) {
    btnFloatingChat.addEventListener('click', openChat);
  }

  const btnCloseChatMobile = document.getElementById('btn-close-chat-mobile');
  if (btnCloseChatMobile) {
    btnCloseChatMobile.addEventListener('click', closeChat);
  }

  const btnStatsMovie = document.getElementById('btn-stats-movie');
  const hudElem = document.getElementById('stream-telemetry-hud');
  const btnCloseTelemetry = document.getElementById('btn-telemetry-close');

  const toggleHud = () => {
    if (!hudElem) return;
    hudElem.style.display = (hudElem.style.display === 'none' || !hudElem.style.display) ? 'block' : 'none';
  };

  if (btnStatsMovie) btnStatsMovie.addEventListener('click', toggleHud);
  if (btnCloseTelemetry) btnCloseTelemetry.addEventListener('click', toggleHud);

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      toggleHud();
    }
  });

  window.addEventListener('popstate', () => {
    parseUrlParams();
    updateKickViews();
    if (AppState.videoUrl) {
      loadVideoSource(AppState.videoUrl, getLatestSyncState());
    } else {
      unloadVideo();
    }
  });

  initChatResizer();
  initRealtimeSyncListener();
}

async function init() {
  parseUrlParams();
  initEventListeners();

  const searchParams = new URLSearchParams(window.location.search);
  const hasCustomVideo = searchParams.has('video') && searchParams.get('video').trim() !== '';
  const hasCustomStreamer = searchParams.has('streamer') && searchParams.get('streamer').trim() !== '';

  if (STREAM_CONFIG) {
    if (STREAM_CONFIG.kickChannel && !hasCustomStreamer) AppState.streamer = STREAM_CONFIG.kickChannel;
    if (STREAM_CONFIG.videoUrl && !hasCustomVideo) AppState.videoUrl = STREAM_CONFIG.videoUrl;
    if (STREAM_CONFIG.offlinePoster) AppState.offlineImg = STREAM_CONFIG.offlinePoster;
    if (STREAM_CONFIG.onlinePoster) AppState.onlineImg = STREAM_CONFIG.onlinePoster;

    if (STREAM_CONFIG.socials) {
      if (STREAM_CONFIG.socials.kickSubscribe) {
        const btnKick = document.getElementById('btn-topbar-kick');
        if (btnKick) btnKick.href = STREAM_CONFIG.socials.kickSubscribe;
      }
      if (STREAM_CONFIG.socials.youtube) {
        const btnYt = document.getElementById('btn-topbar-yt');
        if (btnYt) btnYt.href = STREAM_CONFIG.socials.youtube;
      }
      if (STREAM_CONFIG.socials.instagram) {
        const btnIg = document.getElementById('btn-topbar-ig');
        if (btnIg) btnIg.href = STREAM_CONFIG.socials.instagram;
      }
    }
  }

  updateKickViews();

  if (!STREAM_CONFIG || !STREAM_CONFIG.videoUrl) {
    try {
      const res = await fetchLatestCloudState();
      if (res.ok) {
        const cloudState = await res.json();
        if (cloudState) {
          if (cloudState.videoUrl) AppState.videoUrl = cloudState.videoUrl;
          if (cloudState.isOnline !== undefined) AppState.isOnline = Boolean(cloudState.isOnline);
        }
      }
    } catch (e) {}
  }

  if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
    loadVideoSource(AppState.videoUrl);
  }

  const currentName = AppState.streamer || 'BlackozuTR';
  if (DOM.offlineStreamerName) DOM.offlineStreamerName.textContent = currentName;
  if (DOM.onlineStreamerName) DOM.onlineStreamerName.textContent = currentName;

  if (DOM.offlineBackdrop && AppState.offlineImg) {
    DOM.offlineBackdrop.style.backgroundImage = `url('${AppState.offlineImg}')`;
  }
  if (DOM.onlineBackdrop && AppState.onlineImg) {
    DOM.onlineBackdrop.style.backgroundImage = `url('${AppState.onlineImg}')`;
  }
}

window.__DualStreamState__ = {
  getAppState: () => ({
    streamer: AppState.streamer,
    videoUrl: AppState.videoUrl,
    isOnline: AppState.isOnline
  })
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
