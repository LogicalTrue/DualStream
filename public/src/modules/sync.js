/**
 * ==========================================================================
 * SYNC MODULE
 * Realtime synchronization via WebRTC (PeerJS), BroadcastChannel, StorageEvent, and Vercel Cloud.
 * ==========================================================================
 */

import { DOM } from './dom.js';
import { AppState, STORAGE_KEY, syncChannel, DEFAULT_STREAMER } from './state.js';
import { sendCloudConfig, fetchLatestCloudState } from './api.js';
import { ytPlayerInstance, activeNativeVideo, loadVideoSource, unloadVideo, setPlaybackSyncEmitter } from './player.js';
import { showToast, applyWebcamPosition, openModal } from './ui.js';
import { updateKickViews } from './kick.js';

let lastAdminSyncEmit = 0;
export let latestSyncPlaybackState = null;

// Variables globales de PeerJS
let peerInstance = null;
let viewerConnections = [];
let adminConnToMaster = null;

// Configuración STUN global para atravesar NAT y firewalls de celulares (4G/5G/WiFi)
const PEER_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  }
};

export function getLatestSyncState() {
  return latestSyncPlaybackState;
}

export function getCurrentMasterState() {
  let currentSec = 0;
  let isCurrentlyPlaying = false;
  if (typeof ytPlayerInstance !== 'undefined' && ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
    try {
      currentSec = ytPlayerInstance.getCurrentTime() || 0;
      const st = ytPlayerInstance.getPlayerState();
      isCurrentlyPlaying = (st === 1 || st === 3);
    } catch(e) {}
  } else if (typeof activeNativeVideo !== 'undefined' && activeNativeVideo) {
    currentSec = activeNativeVideo.currentTime || 0;
    isCurrentlyPlaying = !activeNativeVideo.paused;
  }

  return {
    type: 'MASTER_STATE',
    isOnline: AppState.isAdmin || AppState.isOnline,
    offlineImg: AppState.offlineImg || '',
    onlineImg: AppState.onlineImg || '',
    streamer: AppState.streamer,
    videoUrl: AppState.videoUrl,
    camX: AppState.camX,
    camY: AppState.camY,
    camW: AppState.camW,
    currentTime: parseFloat(currentSec.toFixed(2)),
    isPlaying: isCurrentlyPlaying,
    updatedAt: Date.now()
  };
}

export function emitPlaybackSync(currentTime, isPlaying) {
  if (!AppState.isAdmin) return;

  const now = Date.now();
  lastAdminSyncEmit = now;

  const payload = {
    type: 'PLAYBACK_SYNC',
    streamer: AppState.streamer,
    videoUrl: AppState.videoUrl,
    camX: AppState.camX,
    camY: AppState.camY,
    camW: AppState.camW,
    currentTime: parseFloat(currentTime.toFixed(2)),
    isPlaying: Boolean(isPlaying),
    updatedAt: now
  };

  // 1. Emitir localmente por BroadcastChannel
  try {
    if (syncChannel) {
      syncChannel.postMessage(payload);
    }
  } catch (e) {}

  // 2. Enviar a backend Vercel Cloud con autorización
  try {
    sendCloudConfig(payload).catch(() => {});
  } catch (e) {}

  // 3. Emitir directo por WebRTC DataChannel (0ms latencia)
  if (viewerConnections && viewerConnections.length > 0) {
    viewerConnections.forEach(conn => {
      if (conn && conn.open) {
        try { conn.send(payload); } catch(e) {}
      }
    });
  }
}

// Conectar emisor con el player
setPlaybackSyncEmitter(emitPlaybackSync);

export function applyViewerPlaybackSync(data) {
  if (AppState.isAdmin) return;

  latestSyncPlaybackState = data;

  const { currentTime, isPlaying, updatedAt } = data;
  if (currentTime === undefined) return;

  const latencySec = Math.max(0, (Date.now() - (updatedAt || Date.now())) / 1000);
  const targetTime = isPlaying ? currentTime + latencySec : currentTime;

  // 1. Sincronización para YouTube Player
  if (ytPlayerInstance && typeof ytPlayerInstance.getPlayerState === 'function') {
    try {
      const playerState = ytPlayerInstance.getPlayerState();
      const currentYtTime = ytPlayerInstance.getCurrentTime() || 0;

      if (isPlaying) {
        if (playerState !== 1 && playerState !== 3) {
          ytPlayerInstance.playVideo();
        }
        if (Math.abs(currentYtTime - targetTime) > 1.2) {
          ytPlayerInstance.seekTo(targetTime, true);
        }
      } else {
        if (playerState === 1 || playerState === 3) {
          ytPlayerInstance.pauseVideo();
        }
        if (Math.abs(currentYtTime - targetTime) > 0.8) {
          ytPlayerInstance.seekTo(targetTime, true);
        }
      }
    } catch (err) {
      console.warn('Error sincronizando YouTube player', err);
    }
  }

  // 2. Sincronización para Video Nativo HTML5 (.mp4, etc.)
  if (activeNativeVideo) {
    try {
      if (!isPlaying) {
        if (!activeNativeVideo.paused) {
          activeNativeVideo.pause();
        }
        if (Math.abs(activeNativeVideo.currentTime - targetTime) > 0.5) {
          activeNativeVideo.currentTime = targetTime;
        }
      } else {
        if (activeNativeVideo.paused) {
          activeNativeVideo.play().catch(() => {});
        }

        const diff = Math.abs(activeNativeVideo.currentTime - targetTime);
        if (diff > 4.5) {
          activeNativeVideo.currentTime = targetTime;
        }
      }
    } catch (e) {}
  }
}

export function saveAndBroadcastConfig() {
  const configToSave = getCurrentMasterState();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    if (syncChannel) {
      syncChannel.postMessage(configToSave);
    }
  } catch (e) {
    console.warn('Error en storage local', e);
  }

  sendCloudConfig(configToSave).then(async res => {
    if (res.ok) {
      showToast('¡Configuración guardada y transmitida en vivo a todos los espectadores!', 'success');
    } else if (res.status === 401) {
      showToast('Error: No autorizado. La clave secreta de admin es incorrecta.', 'error');
    } else if (res.status === 403) {
      sessionStorage.removeItem('kick_dual_admin_secret');
      sessionStorage.removeItem('kick_dual_admin_session_token');
      showToast('⚠️ Se ha iniciado sesión desde otro dispositivo. Tu sesión de admin se ha cerrado.', 'error');
    }
  }).catch(() => {});

  if (viewerConnections && viewerConnections.length > 0) {
    viewerConnections.forEach(conn => {
      if (conn && conn.open) {
        try { conn.send(configToSave); } catch(e) {}
      }
    });
  }
}

export function updateTheaterStandbyScreens() {
  if (AppState.isAdmin) {
    document.body.classList.remove('viewer-standby');
    if (DOM.theaterOfflineScreen) DOM.theaterOfflineScreen.style.display = 'none';
    if (DOM.theaterOnlineScreen) DOM.theaterOnlineScreen.style.display = 'none';
    return;
  }

  if (DOM.offlineBackdrop) {
    if (AppState.offlineImg) {
      DOM.offlineBackdrop.style.backgroundImage = `url('${AppState.offlineImg}')`;
    } else {
      DOM.offlineBackdrop.style.backgroundImage = 'none';
    }
  }

  if (DOM.onlineBackdrop) {
    if (AppState.onlineImg) {
      DOM.onlineBackdrop.style.backgroundImage = `url('${AppState.onlineImg}')`;
    } else if (AppState.offlineImg) {
      DOM.onlineBackdrop.style.backgroundImage = `url('${AppState.offlineImg}')`;
    } else {
      DOM.onlineBackdrop.style.backgroundImage = 'none';
    }
  }

  const currentName = AppState.streamer || 'Streamer';
  if (DOM.offlineStreamerName) DOM.offlineStreamerName.textContent = currentName;
  if (DOM.onlineStreamerName) DOM.onlineStreamerName.textContent = currentName;

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
  if (!config || AppState.isAdmin) return;

  let changed = false;

  if (config.isOnline !== undefined) {
    AppState.isOnline = Boolean(config.isOnline);
  }
  if (config.offlineImg !== undefined) AppState.offlineImg = config.offlineImg;
  if (config.onlineImg !== undefined) AppState.onlineImg = config.onlineImg;

  updateTheaterStandbyScreens();

  if (config.streamer && config.streamer !== AppState.streamer) {
    AppState.streamer = config.streamer;
    updateKickViews();
    changed = true;
  }

  if (config.videoUrl !== undefined && config.videoUrl !== AppState.videoUrl) {
    AppState.videoUrl = config.videoUrl;
    latestSyncPlaybackState = config;
    if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
      if (AppState.isViewerConnected) {
        loadVideoSource(AppState.videoUrl, config);
      }
    } else {
      unloadVideo();
    }
    changed = true;
  }

  if (config.camX !== undefined) AppState.camX = config.camX;
  if (config.camY !== undefined) AppState.camY = config.camY;
  if (config.camW !== undefined) AppState.camW = config.camW;
  applyWebcamPosition();

  if (AppState.isViewerConnected && (config.type === 'PLAYBACK_SYNC' || config.currentTime !== undefined || config.type === 'MASTER_STATE')) {
    applyViewerPlaybackSync(config);
  }

  if (changed && AppState.isViewerConnected) {
    showToast('🎬 ¡El streamer ha actualizado la Watch Party en vivo!', 'info');
  }
}

function getStreamerRoomId(streamer) {
  return 'dualstream_room_' + (streamer || DEFAULT_STREAMER).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function initPeerSignaling() {
  if (typeof Peer === 'undefined') {
    setTimeout(initPeerSignaling, 300);
    return;
  }

  if (peerInstance) {
    try { peerInstance.destroy(); } catch (e) {}
    peerInstance = null;
  }
  viewerConnections = [];

  const roomId = getStreamerRoomId(AppState.streamer);

  if (AppState.isAdmin) {
    try {
      peerInstance = new Peer(roomId, PEER_CONFIG);

      peerInstance.on('open', (id) => {
        console.log('📡 [Admin WebRTC Host] Sala abierta y lista para móviles y PC:', id);
      });

      peerInstance.on('connection', (conn) => {
        viewerConnections.push(conn);

        conn.on('open', () => {
          const state = getCurrentMasterState();
          try { conn.send(state); } catch(e) {}
        });

        conn.on('data', (msg) => {
          if (msg && msg.type === 'REQUEST_STATE') {
            try { conn.send(getCurrentMasterState()); } catch(e) {}
          }
        });

        conn.on('close', () => {
          viewerConnections = viewerConnections.filter(c => c !== conn);
        });
      });

      peerInstance.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          console.warn('ID de sala en uso. Reintentando...');
        }
      });
    } catch (e) {
      console.warn('Error iniciando PeerJS Host', e);
    }
  } else {
    try {
      peerInstance = new Peer(null, PEER_CONFIG);

      peerInstance.on('open', () => {
        connectToStreamerHost();
      });

      peerInstance.on('error', () => {
        setTimeout(connectToStreamerHost, 1500);
      });
    } catch (e) {
      console.warn('Error iniciando PeerJS Client', e);
    }
  }
}

export function connectToStreamerHost() {
  if (!peerInstance || AppState.isAdmin) return;
  const roomId = getStreamerRoomId(AppState.streamer);
  try {
    if (adminConnToMaster) {
      try { adminConnToMaster.close(); } catch(e) {}
    }
    adminConnToMaster = peerInstance.connect(roomId, { reliable: true });

    adminConnToMaster.on('open', () => {
      console.log('🟢 [Viewer] Conectado en directo al Streamer por WebRTC');
      try { adminConnToMaster.send({ type: 'REQUEST_STATE' }); } catch(e) {}
    });

    adminConnToMaster.on('data', (data) => {
      if (data) {
        applyIncomingConfig(data);
      }
    });

    adminConnToMaster.on('close', () => {
      setTimeout(connectToStreamerHost, 1500);
    });

    adminConnToMaster.on('error', () => {
      setTimeout(connectToStreamerHost, 1500);
    });
  } catch(e) {
    setTimeout(connectToStreamerHost, 2000);
  }
}

export function initRealtimeSyncListener() {
  if (syncChannel) {
    syncChannel.onmessage = (event) => {
      if (event && event.data) {
        const config = event.data.config || event.data;
        if (config) {
          applyIncomingConfig(config);
        }
      }
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const config = JSON.parse(e.newValue);
        applyIncomingConfig(config);
      } catch (err) {
        console.warn('Error procesando evento storage', err);
      }
    }
  });

  initPeerSignaling();

  const fetchCloud = async () => {
    if (AppState.isAdmin) return;
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
  setInterval(fetchCloud, 800);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchCloud();
    }
  });
  window.addEventListener('focus', fetchCloud);

  // Admin Heartbeat & Seek Detector Loop
  let lastTrackedAdminTime = 0;
  let lastTrackedAdminPlaying = false;

  setInterval(() => {
    if (!AppState.isAdmin) return;

    let currentTime = 0;
    let isPlaying = false;
    let hasSource = false;

    if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
      try {
        currentTime = ytPlayerInstance.getCurrentTime() || 0;
        const playerState = ytPlayerInstance.getPlayerState();
        isPlaying = (playerState === 1 || playerState === 3);
        hasSource = true;
      } catch (e) {}
    } else if (activeNativeVideo) {
      try {
        currentTime = activeNativeVideo.currentTime || 0;
        isPlaying = !activeNativeVideo.paused && !activeNativeVideo.ended;
        hasSource = true;
      } catch (e) {}
    }

    if (hasSource) {
      const timeDiff = Math.abs(currentTime - lastTrackedAdminTime);
      const stateChanged = (isPlaying !== lastTrackedAdminPlaying);

      if (stateChanged || timeDiff > 1.5) {
        emitPlaybackSync(currentTime, isPlaying);
      } else if (isPlaying && (Date.now() - lastAdminSyncEmit > 2000)) {
        emitPlaybackSync(currentTime, true);
      }

      lastTrackedAdminTime = currentTime;
      lastTrackedAdminPlaying = isPlaying;
    }
  }, 300);
}
