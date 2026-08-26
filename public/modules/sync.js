import { DOM } from './dom.js';
import { AppState } from './state.js';
import { STREAM_CONFIG } from '../stream-config.js';
import { fetchLatestCloudState } from './api.js';
import { loadVideoSource, isHlsStream, hlsRetryFn, activeNativeVideo } from './player.js';

export let latestSyncPlaybackState = null;

export function getLatestSyncState() {
  return latestSyncPlaybackState;
}

export function updateTheaterStandbyScreens() {
  const defaultOffline = (STREAM_CONFIG && STREAM_CONFIG.offlinePoster) ? STREAM_CONFIG.offlinePoster : 'https://i.imgur.com/WZFLjFB.jpeg';

  if (DOM.offlineBackdrop) {
    const bg = AppState.offlineImg || defaultOffline;
    DOM.offlineBackdrop.style.backgroundImage = `url('${bg}')`;
  }

  if (DOM.onlineBackdrop) {
    const bg = AppState.onlineImg || AppState.offlineImg || defaultOffline;
    DOM.onlineBackdrop.style.backgroundImage = `url('${bg}')`;
  }

  const currentName = AppState.streamer || 'BlackozuTR';
  if (DOM.offlineStreamerName) DOM.offlineStreamerName.textContent = currentName;
  if (DOM.onlineStreamerName) DOM.onlineStreamerName.textContent = currentName;

  if (isHlsStream(AppState.videoUrl)) {
    return;
  }

  if (!AppState.isOnline) {
    document.body.classList.add('viewer-standby');
    if (DOM.theaterOfflineScreen) DOM.theaterOfflineScreen.style.display = 'flex';
    if (DOM.theaterOnlineScreen) DOM.theaterOnlineScreen.style.display = 'none';
  } else {
    if (DOM.theaterOfflineScreen) DOM.theaterOfflineScreen.style.display = 'none';
    
    if (!AppState.isViewerConnected) {
      document.body.classList.add('viewer-standby');
      if (DOM.theaterOnlineScreen) DOM.theaterOnlineScreen.style.display = 'flex';
    } else {
      document.body.classList.remove('viewer-standby');
      if (DOM.theaterOnlineScreen) DOM.theaterOnlineScreen.style.display = 'none';
    }
  }
}

export function applyIncomingConfig(config) {
  if (!config) return;

  if (STREAM_CONFIG) {
    if (STREAM_CONFIG.kickChannel) AppState.streamer = STREAM_CONFIG.kickChannel;
    if (STREAM_CONFIG.videoUrl) AppState.videoUrl = STREAM_CONFIG.videoUrl;
    if (STREAM_CONFIG.offlinePoster) AppState.offlineImg = STREAM_CONFIG.offlinePoster;
    if (STREAM_CONFIG.onlinePoster) AppState.onlineImg = STREAM_CONFIG.onlinePoster;
  }

  if (config.isOnline !== undefined) {
    const wasOnline = AppState.isOnline;
    AppState.isOnline = Boolean(config.isOnline);
    
    if (isHlsStream(AppState.videoUrl)) {
      if (AppState.isOnline && !wasOnline) {
        if (typeof hlsRetryFn === 'function') {
          hlsRetryFn();
        } else if (!activeNativeVideo) {
          loadVideoSource(AppState.videoUrl);
        }
      } else if (!AppState.isOnline && wasOnline) {
        const offlineScreen = document.getElementById('theater-offline-screen');
        const mediaWrapper = document.getElementById('movie-media-wrapper');
        if (offlineScreen) offlineScreen.style.setProperty('display', 'flex', 'important');
        if (mediaWrapper) mediaWrapper.style.setProperty('display', 'none', 'important');
      }
    }
  }

  updateTheaterStandbyScreens();
}

export function initRealtimeSyncListener() {
  const fetchCloud = async () => {
    try {
      const res = await fetchLatestCloudState();
      if (res.ok) {
        const config = await res.json();
        if (config) {
          applyIncomingConfig(config);
        }
      }
    } catch (e) {}
  };

  fetchCloud();
  setInterval(fetchCloud, 1200);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchCloud();
    }
  });
  window.addEventListener('focus', fetchCloud);
}
