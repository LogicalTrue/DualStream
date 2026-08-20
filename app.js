/**
 * ==========================================================================
 * KICK DUAL VIEWER — APPLICATION CORE
 * Watch Party synchronizer with Admin Mode (Streamer) & Viewer Mode (Audience).
 * ==========================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. CONFIGURATION & STATE
  // --------------------------------------------------------------------------

  // Clave de almacenamiento persistente
  const STORAGE_KEY = 'kick_dual_streamer_config';
  const SYNC_CHANNEL_NAME = 'kick_dual_watch_party_sync';
  const ADMIN_PIN = '1234';

  // Canal de difusión en tiempo real entre pestañas / navegadores
  let syncChannel = null;
  try {
    if (window.BroadcastChannel) {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
  } catch (e) {
    console.warn('BroadcastChannel no soportado, usando fallback StorageEvent', e);
  }

  // Canal de eventos en vivo en tiempo real (EventSource / SSE)
  const CLOUD_SYNC_TOPIC = 'https://ntfy.sh/dualstream_watchparty_official_sync_v2';

  // Configuración inicial / por defecto (blackozutr)
  const DEFAULT_CONFIG = {
    streamer: 'blackozutr',
    videoUrl: 'https://www.youtube.com/watch?v=A8qw5r6aDYo',
    camX: 2, // %
    camY: 3, // %
    camW: 26 // %
  };

  const DEFAULT_STREAMER = DEFAULT_CONFIG.streamer;
  const DEFAULT_VIDEO = DEFAULT_CONFIG.videoUrl;

  /**
   * Obtiene la configuración guardada por el admin
   */
  function loadPersistedConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Error leyendo configuración persistente', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Guarda y difunde la configuración a todos los espectadores en tiempo real (Local + Nube)
   */
  function saveAndBroadcastConfig() {
    const configToSave = {
      streamer: AppState.streamer,
      videoUrl: AppState.videoUrl,
      camX: AppState.camX,
      camY: AppState.camY,
      camW: AppState.camW,
      updatedAt: Date.now()
    };

    // 1. Guardar en localStorage local y BroadcastChannel
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
      if (syncChannel) {
        syncChannel.postMessage({ type: 'CONFIG_UPDATED', config: configToSave });
      }
    } catch (e) {
      console.warn('Error en storage local', e);
    }

    // 2. Transmitir por canal de eventos en vivo para todos los espectadores en Vercel
    try {
      fetch(CLOUD_SYNC_TOPIC, {
        method: 'POST',
        body: JSON.stringify(configToSave),
        headers: {
          'Title': 'DualStream Global Sync',
          'Tags': 'tv,video_camera'
        }
      }).catch(err => console.warn('Error en broadcast a la nube', err));
    } catch (err) {
      console.warn('Fallo al emitir a la nube', err);
    }
  }

  const persisted = loadPersistedConfig();

  const AppState = {
    isAdmin: false,
    streamer: persisted.streamer,
    videoUrl: persisted.videoUrl,
    chatVisible: true,
    webcamVisible: true,
    camX: persisted.camX,
    camY: persisted.camY,
    camW: persisted.camW,
    chatWidth: 320
  };

  // --------------------------------------------------------------------------
  // 2. DOM ELEMENTS
  // --------------------------------------------------------------------------
  const DOM = {
    // Header & Mode
    appHeader: document.getElementById('app-header'),
    appModeBadge: document.getElementById('app-mode-badge'),
    currentStreamerLabel: document.getElementById('current-streamer-label'),
    currentVideoTitle: document.getElementById('current-video-title'),
    btnChangeStreamer: document.getElementById('btn-change-streamer'),
    btnOpenVideoModal: document.getElementById('btn-open-video-modal'),
    btnShareViewerLink: document.getElementById('btn-share-viewer-link'),
    btnOpenAdminAuth: document.getElementById('btn-open-admin-auth'),
    btnExitAdmin: document.getElementById('btn-exit-admin'),
    btnSyncGuide: document.getElementById('btn-sync-guide'),

    // Stage & Video Box
    watchContainer: document.getElementById('watch-container'),
    stageSection: document.getElementById('stage-section'),
    videoTheater: document.getElementById('video-theater'),
    moviePlayerBox: document.getElementById('movie-player-box'),
    moviePlaceholder: document.getElementById('movie-placeholder'),
    movieMediaWrapper: document.getElementById('movie-media-wrapper'),
    btnPlaceholderLoad: document.getElementById('btn-placeholder-load'),
    btnLoadDemo: document.getElementById('btn-load-demo'),
    btnReloadMovie: document.getElementById('btn-reload-movie'),
    btnFullscreenMovie: document.getElementById('btn-fullscreen-movie'),

    // Webcam Overlay Card
    webcamCard: document.getElementById('webcam-card'),
    webcamDragOverlay: document.getElementById('webcam-drag-overlay'),
    webcamResizeHandle: document.getElementById('webcam-resize-handle'),
    webcamChannelText: document.getElementById('webcam-channel-text'),
    kickPlayerFrame: document.getElementById('kick-player-frame'),
    btnReloadKick: document.getElementById('btn-reload-kick'),
    btnHideWebcam: document.getElementById('btn-hide-webcam'),
    btnWebcamToggleFooter: document.getElementById('btn-webcam-toggle-footer'),
    btnOpenKickExternal: document.getElementById('btn-open-kick-external'),

    // Chat Sidebar & Resizer
    chatColumn: document.getElementById('chat-column'),
    chatResizer: document.getElementById('chat-resizer'),
    kickChatFrame: document.getElementById('kick-chat-frame'),
    btnToggleChat: document.getElementById('btn-toggle-chat'),
    btnReloadChat: document.getElementById('btn-reload-chat'),
    btnCloseChatMobile: document.getElementById('btn-close-chat-mobile'),

    // Publish Modal
    modalPublish: document.getElementById('modal-publish'),
    inputPublishUrl: document.getElementById('input-publish-url'),
    btnSavePublish: document.getElementById('btn-save-publish'),
    btnCopyPublishUrl: document.getElementById('btn-copy-publish-url'),
    btnPreviewViewer: document.getElementById('btn-preview-viewer'),
    btnClosePublishModal: document.getElementById('btn-close-publish-modal'),

    // Modals
    modalAuth: document.getElementById('modal-auth'),
    formAuth: document.getElementById('form-auth'),
    inputAdminPin: document.getElementById('input-admin-pin'),
    btnCloseAuthModal: document.getElementById('btn-close-auth-modal'),
    btnCancelAuthModal: document.getElementById('btn-cancel-auth-modal'),

    modalVideo: document.getElementById('modal-video'),
    formLoadVideo: document.getElementById('form-load-video'),
    inputVideoUrl: document.getElementById('input-video-url'),
    btnCloseVideoModal: document.getElementById('btn-close-video-modal'),
    btnCancelVideoModal: document.getElementById('btn-cancel-video-modal'),

    modalStreamer: document.getElementById('modal-streamer'),
    formChangeStreamer: document.getElementById('form-change-streamer'),
    inputStreamerName: document.getElementById('input-streamer-name'),
    btnCloseStreamerModal: document.getElementById('btn-close-streamer-modal'),
    btnCancelStreamerModal: document.getElementById('btn-cancel-streamer-modal'),

    modalSync: document.getElementById('modal-sync'),
    btnCloseSyncModal: document.getElementById('btn-close-sync-modal'),
    btnDismissSyncModal: document.getElementById('btn-dismiss-sync-modal'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // --------------------------------------------------------------------------
  // 3. ADMIN / VIEWER MODE MANAGEMENT
  // --------------------------------------------------------------------------

  function setMode(isAdmin) {
    AppState.isAdmin = isAdmin;
    if (isAdmin) {
      document.body.classList.remove('mode-viewer');
      document.body.classList.add('mode-admin');
      if (DOM.appModeBadge) {
        DOM.appModeBadge.textContent = 'Streamer Admin';
        DOM.appModeBadge.className = 'badge-tag admin-badge';
      }
      sessionStorage.setItem('kick_dual_is_admin', 'true');
    } else {
      document.body.classList.remove('mode-admin');
      document.body.classList.add('mode-viewer');
      if (DOM.appModeBadge) {
        DOM.appModeBadge.textContent = 'Watch Party';
        DOM.appModeBadge.className = 'badge-tag';
      }
      sessionStorage.removeItem('kick_dual_is_admin');
    }
  }

  // --------------------------------------------------------------------------
  // 4. URL PARAMETERS
  // --------------------------------------------------------------------------

  function parseUrlParams() {
    const searchParams = new URLSearchParams(window.location.search);

    // Check mode
    const modeParam = searchParams.get('mode');
    const adminParam = searchParams.get('admin');

    if (modeParam === 'viewer') {
      setMode(false);
    } else if (adminParam === '1' || adminParam === 'true') {
      setMode(true);
    } else {
      // Por defecto para cualquier visitante: modo espectador (salvo si esta pestaña específica inició sesión como admin)
      const storedAdmin = sessionStorage.getItem('kick_dual_is_admin') === 'true';
      setMode(storedAdmin);
    }

    // Si viene algún parámetro explícito en la URL, sobrescribe la persistencia
    const rawStreamer = searchParams.get('streamer');
    if (rawStreamer && rawStreamer.trim() !== '') {
      AppState.streamer = sanitizeStreamerName(rawStreamer);
    }

    const rawVideo = searchParams.get('video');
    if (rawVideo && rawVideo.trim() !== '') {
      AppState.videoUrl = decodeURIComponent(rawVideo.trim());
    }

    const rawCamX = searchParams.get('cam_x');
    const rawCamY = searchParams.get('cam_y');
    const rawCamW = searchParams.get('cam_w');

    if (rawCamX !== null) AppState.camX = parseFloat(rawCamX);
    if (rawCamY !== null) AppState.camY = parseFloat(rawCamY);
    if (rawCamW !== null) AppState.camW = parseFloat(rawCamW);

    applyWebcamPosition();
  }

  function applyWebcamPosition() {
    if (!DOM.webcamCard) return;
    DOM.webcamCard.style.left = `${AppState.camX}%`;
    DOM.webcamCard.style.top = `${AppState.camY}%`;
    DOM.webcamCard.style.right = 'auto';
    DOM.webcamCard.style.bottom = 'auto';
    if (AppState.camW) {
      DOM.webcamCard.style.width = `${AppState.camW}%`;
    }
  }

  function syncUrlParams() {
    const url = new URL(window.location.href);

    if (AppState.streamer && AppState.streamer !== DEFAULT_STREAMER) {
      url.searchParams.set('streamer', AppState.streamer);
    } else {
      url.searchParams.delete('streamer');
    }

    if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
      url.searchParams.set('video', AppState.videoUrl);
    } else {
      url.searchParams.delete('video');
    }

    window.history.replaceState({}, '', url.toString());
  }

  function sanitizeStreamerName(input) {
    if (!input) return DEFAULT_STREAMER;
    let clean = input.trim().toLowerCase();
    clean = clean.replace(/^https?:\/\/(www\.)?kick\.com\//i, '');
    clean = clean.replace(/\/chatroom.*$/i, '');
    clean = clean.replace(/[\/\?#].*$/, '');
    clean = clean.replace(/[^a-z0-9_]/g, '');
    return clean || DEFAULT_STREAMER;
  }

  // --------------------------------------------------------------------------
  // 5. KICK VIEWS (WEBCAM & CHAT)
  // --------------------------------------------------------------------------

  function updateKickViews() {
    const channel = AppState.streamer;

    if (DOM.currentStreamerLabel) {
      DOM.currentStreamerLabel.textContent = channel;
    }
    if (DOM.webcamChannelText) {
      DOM.webcamChannelText.textContent = channel;
    }
    if (DOM.btnOpenKickExternal) {
      DOM.btnOpenKickExternal.href = `https://kick.com/${channel}`;
    }

    // Kick Stream Player
    const playerUrl = `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=false`;
    if (DOM.kickPlayerFrame.src !== playerUrl) {
      DOM.kickPlayerFrame.src = playerUrl;
    }

    // Kick Popout Live Chat
    const chatUrl = `https://kick.com/popout/${encodeURIComponent(channel)}/chat`;
    if (DOM.kickChatFrame.src !== chatUrl) {
      DOM.kickChatFrame.src = chatUrl;
    }
  }

  function reloadKickPlayer() {
    const currentSrc = DOM.kickPlayerFrame.src;
    DOM.kickPlayerFrame.src = 'about:blank';
    setTimeout(() => {
      DOM.kickPlayerFrame.src = currentSrc;
      showToast('Webcam de Kick recargada', 'success');
    }, 150);
  }

  function reloadKickChat() {
    const currentSrc = DOM.kickChatFrame.src;
    DOM.kickChatFrame.src = 'about:blank';
    setTimeout(() => {
      DOM.kickChatFrame.src = currentSrc;
      showToast('Chat de Kick recargado', 'success');
    }, 150);
  }

  // --------------------------------------------------------------------------
  // 6. DRAGGABLE & RESIZABLE WEBCAM (LIBRE ARRASTRE)
  // --------------------------------------------------------------------------

  function initWebcamDragAndResize() {
    let isDragging = false;
    let isResizing = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let initialWidth = 0;

    // --- Arrastre libre con el ratón o touch ---
    const onDragStart = (e) => {
      if (!AppState.isAdmin) return; // Solo el admin puede mover la cámara
      if (e.target.closest('#webcam-resize-handle') || e.target.closest('.webcam-header-actions')) return;

      isDragging = true;
      DOM.webcamCard.classList.add('is-dragging');

      // Evitar que el iframe de Kick capture los eventos del mouse durante el arrastre
      DOM.kickPlayerFrame.style.pointerEvents = 'none';

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const cardRect = DOM.webcamCard.getBoundingClientRect();
      const parentRect = DOM.videoTheater.getBoundingClientRect();

      initialLeft = cardRect.left - parentRect.left;
      initialTop = cardRect.top - parentRect.top;

      e.preventDefault();
    };

    const onMouseMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      if (isDragging) {
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        const parentRect = DOM.videoTheater.getBoundingClientRect();
        const cardWidth = DOM.webcamCard.offsetWidth;
        const cardHeight = DOM.webcamCard.offsetHeight;

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // Limitar dentro del escenario
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + cardWidth > parentRect.width) newLeft = parentRect.width - cardWidth;
        if (newTop + cardHeight > parentRect.height) newTop = parentRect.height - cardHeight;

        // Convertir a porcentajes para que sea 100% responsivo
        AppState.camX = parseFloat(((newLeft / parentRect.width) * 100).toFixed(2));
        AppState.camY = parseFloat(((newTop / parentRect.height) * 100).toFixed(2));

        DOM.webcamCard.style.left = `${AppState.camX}%`;
        DOM.webcamCard.style.top = `${AppState.camY}%`;
      } else if (isResizing) {
        const deltaX = clientX - startX;
        const parentRect = DOM.videoTheater.getBoundingClientRect();
        let newW = initialWidth + deltaX;

        // Límites de ancho
        if (newW < 180) newW = 180;
        if (newW > parentRect.width * 0.75) newW = parentRect.width * 0.75;

        AppState.camW = parseFloat(((newW / parentRect.width) * 100).toFixed(2));
        DOM.webcamCard.style.width = `${AppState.camW}%`;
      }
    };

    const onMouseUp = () => {
      if (isDragging || isResizing) {
        isDragging = false;
        isResizing = false;
        DOM.webcamCard.classList.remove('is-dragging');
        DOM.kickPlayerFrame.style.pointerEvents = 'auto';
      }
    };

    // Resizing desde la esquina inferior derecha
    const onResizeStart = (e) => {
      if (!AppState.isAdmin) return;
      isResizing = true;
      DOM.kickPlayerFrame.style.pointerEvents = 'none';

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;
      initialWidth = DOM.webcamCard.offsetWidth;

      e.stopPropagation();
      e.preventDefault();
    };

    if (DOM.webcamDragOverlay) {
      DOM.webcamDragOverlay.addEventListener('mousedown', onDragStart);
      DOM.webcamDragOverlay.addEventListener('touchstart', onDragStart, { passive: false });
    } else if (DOM.webcamCard) {
      DOM.webcamCard.addEventListener('mousedown', onDragStart);
      DOM.webcamCard.addEventListener('touchstart', onDragStart, { passive: false });
    }

    if (DOM.webcamResizeHandle) {
      DOM.webcamResizeHandle.addEventListener('mousedown', onResizeStart);
      DOM.webcamResizeHandle.addEventListener('touchstart', onResizeStart, { passive: false });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onMouseMove, { passive: false });

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onMouseUp);
  }

  // Preajustes rápidos de posición de esquinas
  function cycleWebcamPosition() {
    const corners = [
      { x: 2, y: 3 },    // Arriba Izquierda
      { x: 74, y: 3 },   // Arriba Derecha
      { x: 2, y: 68 },   // Abajo Izquierda
      { x: 74, y: 68 }   // Abajo Derecha
    ];

    const currentIdx = corners.findIndex(c => Math.abs(c.x - AppState.camX) < 15 && Math.abs(c.y - AppState.camY) < 15);
    const nextIdx = (currentIdx + 1) % corners.length;

    AppState.camX = corners[nextIdx].x;
    AppState.camY = corners[nextIdx].y;
    applyWebcamPosition();

    const names = ['Arriba Izquierda', 'Arriba Derecha', 'Abajo Izquierda', 'Abajo Derecha'];
    showToast(`Webcam: ${names[nextIdx]}`, 'info');
  }

  // Preajustes rápidos de tamaño
  function cycleWebcamSize() {
    const sizes = [18, 26, 36]; // Porcentajes de ancho
    const currentIdx = sizes.findIndex(s => Math.abs(s - AppState.camW) < 5);
    const nextIdx = (currentIdx + 1) % sizes.length;

    AppState.camW = sizes[nextIdx];
    applyWebcamPosition();

    const names = ['Chica', 'Mediana', 'Grande'];
    showToast(`Webcam: Tamaño ${names[nextIdx]}`, 'info');
  }

  function toggleWebcamVisibility() {
    AppState.webcamVisible = !AppState.webcamVisible;
    if (AppState.webcamVisible) {
      DOM.webcamCard.classList.remove('hidden');
      DOM.btnWebcamToggleFooter.classList.add('active');
      showToast('Webcam visible', 'info');
    } else {
      DOM.webcamCard.classList.add('hidden');
      DOM.btnWebcamToggleFooter.classList.remove('active');
      showToast('Webcam oculta', 'info');
    }
  }

  // --------------------------------------------------------------------------
  // 7. MAIN VIDEO PLAYER
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // 7. MAIN VIDEO PLAYER & TIME SYNCHRONIZER (YOUTUBE API & HTML5)
  // --------------------------------------------------------------------------

  let lastAdminSyncEmit = 0;
  let activeNativeVideo = null;
  let ytPlayerInstance = null;
  let isYtApiReady = false;
  let pendingYtVideoId = null;

  // Callback oficial de YouTube API
  window.onYouTubeIframeAPIReady = function () {
    isYtApiReady = true;
    if (pendingYtVideoId) {
      initYouTubePlayer(pendingYtVideoId);
    }
  };

  function emitPlaybackSync(currentTime, isPlaying) {
    if (!AppState.isAdmin) return; // Solo el admin emite eventos máster

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

    // Emitir localmente por BroadcastChannel y a la nube
    try {
      if (syncChannel) {
        syncChannel.postMessage(payload);
      }
      fetch(CLOUD_SYNC_TOPIC, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Title': 'Playback Sync', 'Tags': 'arrow_forward,play_or_pause_button' }
      }).catch(() => {});
    } catch (e) {}
  }

  function applyViewerPlaybackSync(data) {
    if (AppState.isAdmin || !document.body.classList.contains('mode-viewer')) return;

    const { currentTime, isPlaying, updatedAt } = data;
    if (currentTime === undefined) return;

    // Compensar latencia de red para sincronización exacta
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
          if (Math.abs(currentYtTime - targetTime) > 1.0) {
            ytPlayerInstance.seekTo(targetTime, true);
          }
        }
      } catch (err) {
        console.warn('Error sincronizando YouTube player', err);
      }
    }

    // 2. Sincronización para Video Nativo HTML5
    if (activeNativeVideo) {
      try {
        if (isPlaying && activeNativeVideo.paused) {
          activeNativeVideo.play().catch(() => {});
        } else if (!isPlaying && !activeNativeVideo.paused) {
          activeNativeVideo.pause();
        }

        if (Math.abs(activeNativeVideo.currentTime - targetTime) > 1.2) {
          activeNativeVideo.currentTime = targetTime;
        }
      } catch (e) {}
    }
  }

  function loadVideoSource(rawInput) {
    if (!rawInput || rawInput.trim() === '') {
      unloadVideo();
      return;
    }

    let url = rawInput.trim();

    // Extraer src si pegaron un <iframe>
    const iframeSrcMatch = url.match(/<iframe.*?src=["'](.*?)["']/i);
    if (iframeSrcMatch && iframeSrcMatch[1]) {
      url = iframeSrcMatch[1];
    }

    AppState.videoUrl = url;
    syncUrlParams();

    DOM.movieMediaWrapper.innerHTML = '';
    activeNativeVideo = null;
    if (ytPlayerInstance && typeof ytPlayerInstance.destroy === 'function') {
      try { ytPlayerInstance.destroy(); } catch (e) {}
      ytPlayerInstance = null;
    }

    const ytId = extractYouTubeId(url);

    if (ytId) {
      // Contenedor dedicado para YouTube API
      const ytContainer = document.createElement('div');
      ytContainer.id = 'yt-player-target';
      ytContainer.className = 'media-frame';
      DOM.movieMediaWrapper.appendChild(ytContainer);

      if (window.YT && window.YT.Player) {
        initYouTubePlayer(ytId);
      } else {
        pendingYtVideoId = ytId;
      }
    } else if (isDirectVideoFile(url)) {
      renderNativeVideo(url);
    } else {
      renderIframeVideo(url);
    }

    DOM.moviePlaceholder.style.display = 'none';
    DOM.movieMediaWrapper.style.display = 'block';

    updateVideoInfoBadge(url);
  }

  function extractYouTubeId(url) {
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return (ytMatch && ytMatch[1]) ? ytMatch[1] : null;
  }

  function initYouTubePlayer(videoId) {
    pendingYtVideoId = null;
    try {
      ytPlayerInstance = new YT.Player('yt-player-target', {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: AppState.isAdmin ? 1 : 0, // Solo admin tiene controles
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => {
            if (!AppState.isAdmin) {
              // En modo viewer en móvil, iniciar en mute para saltar el bloqueo de autoplay
              try { e.target.mute(); } catch (err) {}
            }
            e.target.playVideo();
          },
          onStateChange: (e) => {
            if (AppState.isAdmin) {
              const state = e.data;
              const currentTime = e.target.getCurrentTime() || 0;
              if (state === 1) { // Playing
                emitPlaybackSync(currentTime, true);
              } else if (state === 2) { // Paused
                emitPlaybackSync(currentTime, false);
              } else if (state === 3) { // Buffering (Seek)
                emitPlaybackSync(currentTime, true);
              }
            }
          }
        }
      });
    } catch (e) {
      console.warn('Error inicializando YT.Player', e);
    }
  }

  // Desbloqueo de Audio y Sincronización en Móviles
  function unlockViewerMobileAudio() {
    const banner = document.getElementById('mobile-sync-unlock-banner');
    if (banner) banner.classList.add('hidden');

    if (ytPlayerInstance && typeof ytPlayerInstance.unMute === 'function') {
      try {
        ytPlayerInstance.unMute();
        ytPlayerInstance.playVideo();
      } catch (e) {}
    }

    if (activeNativeVideo) {
      try {
        activeNativeVideo.muted = false;
        activeNativeVideo.play().catch(() => {});
      } catch (e) {}
    }

    showToast('🔊 ¡Audio activado y sincronizado!', 'success');
  }

  // Detector instantáneo de saltos en el tiempo (Seek / Adelantar / Retroceder) para Admin
  let lastTrackedAdminTime = 0;

  setInterval(() => {
    if (AppState.isAdmin && ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
      try {
        const currentTime = ytPlayerInstance.getCurrentTime();
        const playerState = ytPlayerInstance.getPlayerState();
        const isPlaying = (playerState === 1 || playerState === 3);

        if (currentTime !== undefined) {
          // Detectar saltos manuales en la barra de tiempo (Adelantar o Retroceder)
          const diff = Math.abs(currentTime - lastTrackedAdminTime);

          if (diff > 1.8) {
            // ¡El admin acaba de adelantar o retroceder el video!
            emitPlaybackSync(currentTime, isPlaying);
          } else if (isPlaying && Date.now() - lastAdminSyncEmit > 1200) {
            // Heartbeat de sincronización continua
            emitPlaybackSync(currentTime, true);
          }

          lastTrackedAdminTime = currentTime;
        }
      } catch (e) {}
    }
  }, 350);

  function isDirectVideoFile(url) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.mp4') ||
      cleanUrl.endsWith('.webm') ||
      cleanUrl.endsWith('.ogg') ||
      cleanUrl.endsWith('.mkv');
  }

  function renderNativeVideo(url) {
    const videoElem = document.createElement('video');
    videoElem.className = 'native-video-player';
    videoElem.controls = AppState.isAdmin;
    videoElem.autoplay = true;
    videoElem.playsInline = true;
    videoElem.src = url;

    activeNativeVideo = videoElem;

    if (AppState.isAdmin) {
      videoElem.addEventListener('play', () => emitPlaybackSync(videoElem.currentTime, true));
      videoElem.addEventListener('pause', () => emitPlaybackSync(videoElem.currentTime, false));
      videoElem.addEventListener('seeked', () => emitPlaybackSync(videoElem.currentTime, !videoElem.paused));
      videoElem.addEventListener('timeupdate', () => {
        if (!videoElem.paused && Date.now() - lastAdminSyncEmit > 1500) {
          emitPlaybackSync(videoElem.currentTime, true);
        }
      });
    }

    videoElem.addEventListener('error', () => {
      showToast('Error al reproducir el video. Verifica el enlace.', 'error');
    });

    DOM.movieMediaWrapper.appendChild(videoElem);
  }

  function renderIframeVideo(embedUrl) {
    const iframe = document.createElement('iframe');
    iframe.className = 'media-frame';
    iframe.id = 'movie-iframe-player';
    iframe.src = embedUrl;
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; display-capture');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.setAttribute('title', 'Movie Player');

    DOM.movieMediaWrapper.appendChild(iframe);
  }

  function unloadVideo() {
    AppState.videoUrl = '';
    syncUrlParams();
    DOM.movieMediaWrapper.innerHTML = '';
    DOM.movieMediaWrapper.style.display = 'none';
    DOM.moviePlaceholder.style.display = 'flex';
    if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = 'Sin video cargado';
  }

  function updateVideoInfoBadge(url) {
    let hostname = 'Fuente externa';
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname.replace('www.', '');
    } catch (e) {
      hostname = 'Video cargado';
    }
    if (DOM.currentVideoTitle) DOM.currentVideoTitle.textContent = hostname;
  }

  function reloadMoviePlayer() {
    if (!AppState.videoUrl) {
      showToast('No hay video cargado para recargar', 'info');
      return;
    }
    loadVideoSource(AppState.videoUrl);
    showToast('Reproductor de video recargado', 'success');
  }

  // --------------------------------------------------------------------------
  // 8. FULLSCREEN & RESIZABLE CHAT
  // --------------------------------------------------------------------------

  function toggleFullscreen(element) {
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

  function toggleChatColumn() {
    AppState.chatVisible = !AppState.chatVisible;
    if (AppState.chatVisible) {
      DOM.chatColumn.classList.remove('collapsed');
      DOM.chatResizer.style.display = 'flex';
      DOM.btnToggleChat.classList.add('active');
      showToast('Chat visible', 'info');
    } else {
      DOM.chatColumn.classList.add('collapsed');
      DOM.chatResizer.style.display = 'none';
      DOM.btnToggleChat.classList.remove('active');
      showToast('Chat ocultado (máximo tamaño de video)', 'info');
    }
  }

  function initChatResizer() {
    let isDragging = false;

    const onMouseDown = (e) => {
      isDragging = true;
      DOM.chatResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const containerRect = DOM.watchContainer.getBoundingClientRect();
      let newChatWidth = containerRect.right - e.clientX;

      if (newChatWidth < 240) newChatWidth = 240;
      if (newChatWidth > 580) newChatWidth = 580;

      AppState.chatWidth = newChatWidth;
      document.documentElement.style.setProperty('--chat-width', `${newChatWidth}px`);
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        DOM.chatResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    DOM.chatResizer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Genera la URL pública súper limpia para los espectadores
   */
  function generatePublicViewerUrl() {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('mode', 'viewer');
    return url.toString();
  }

  /**
   * Guarda toda la configuración en persistencia y la emite en tiempo real a todos los viewers
   */
  function handleSaveAndPublish() {
    saveAndBroadcastConfig(); // Guarda y emite en tiempo real
    const publicUrl = generatePublicViewerUrl();
    if (DOM.inputPublishUrl) {
      DOM.inputPublishUrl.value = publicUrl;
    }
    openModal(DOM.modalPublish);
    showToast('¡Configuración guardada y transmitida en vivo a todos los espectadores!', 'success');
  }

  /**
   * Escucha cambios en tiempo real del streamer para aplicarlos inmediatamente a los espectadores
   */
  function initRealtimeSyncListener() {
    let lastProcessedTimestamp = 0;

    // Función que aplica la configuración recibida
    const applyIncomingConfig = (config) => {
      if (!config) return;

      // Solo aplicar a espectadores
      if (document.body.classList.contains('mode-viewer') || !AppState.isAdmin) {
        let changed = false;

        // 1. Actualizar Streamer si cambió
        if (config.streamer && config.streamer !== AppState.streamer) {
          AppState.streamer = config.streamer;
          updateKickViews();
          reconnectCloudSync(); // Reconectar al topic del nuevo streamer
          changed = true;
        }

        // 2. Actualizar Video si cambió
        if (config.videoUrl !== undefined && config.videoUrl !== AppState.videoUrl) {
          AppState.videoUrl = config.videoUrl;
          if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
            loadVideoSource(AppState.videoUrl);
          } else {
            unloadVideo();
          }
          changed = true;
        }

        // 3. Actualizar Posición y Tamaño de la Webcam
        if (config.camX !== undefined) AppState.camX = config.camX;
        if (config.camY !== undefined) AppState.camY = config.camY;
        if (config.camW !== undefined) AppState.camW = config.camW;
        applyWebcamPosition();

        // 4. Sincronización segundo a segundo de reproducción
        if (config.type === 'PLAYBACK_SYNC' || config.currentTime !== undefined) {
          applyViewerPlaybackSync(config);
        }

        if (changed) {
          showToast('🎬 ¡El streamer ha actualizado la Watch Party en vivo!', 'info');
        }
      }
    };

    // 1. Escuchar por BroadcastChannel (local 0ms latencia)
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

    // 2. Escuchar por StorageEvent (compatibilidad entre pestañas del mismo navegador)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const config = JSON.parse(e.newValue);
          lastProcessedTimestamp = config.updatedAt || Date.now();
          applyIncomingConfig(config);
        } catch (err) {
          console.warn('Error procesando evento storage', err);
        }
      }
    });

    // 3. Escuchar EventSource en la Nube (Eventos instantáneos en Vercel para todos los espectadores)
    let cloudEventSource = null;

    function initCloudSync() {
      if (cloudEventSource) {
        try { cloudEventSource.close(); } catch (e) {}
      }

      try {
        const sseUrl = `${CLOUD_SYNC_TOPIC}/sse`;
        cloudEventSource = new EventSource(sseUrl);

        cloudEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const rawMessage = data.message || data;
            const config = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
            if (config) {
              applyIncomingConfig(config);
            }
          } catch (e) {}
        };

        cloudEventSource.onerror = () => {};
      } catch (e) {
        console.warn('EventSource cloud sync no disponible', e);
      }
    }

    initCloudSync();

    // 4. Polling de respaldo a la Base de Datos Global en la Nube
    const pollCloudDatabase = async () => {
      if (document.body.classList.contains('mode-viewer') || !AppState.isAdmin) {
        try {
          const res = await fetch(CLOUD_CONFIG_URL, { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            const config = (json && json.data) ? json.data : json;
            if (config && config.streamer) {
              const configTime = config.updatedAt || 1;
              if (configTime > lastProcessedTimestamp) {
                lastProcessedTimestamp = configTime;
                applyIncomingConfig(config);
              }
            }
          }
        } catch (err) { }
      }
    };

    // Consulta inicial inmediata para que el viewer cargue todo lo que dejó el admin
    pollCloudDatabase();
    setInterval(pollCloudDatabase, 5000);
  }

  // --------------------------------------------------------------------------
  // 9. MODALS MANAGER
  // --------------------------------------------------------------------------

  function openModal(modalElem) {
    if (!modalElem) return;
    modalElem.classList.add('active');
    modalElem.setAttribute('aria-hidden', 'false');
    const input = modalElem.querySelector('input, textarea');
    if (input) setTimeout(() => input.focus(), 100);
  }

  function closeModal(modalElem) {
    if (!modalElem) return;
    modalElem.classList.remove('active');
    modalElem.setAttribute('aria-hidden', 'true');
  }

  // --------------------------------------------------------------------------
  // 10. TOAST NOTIFICATIONS
  // --------------------------------------------------------------------------

  function showToast(message, type = 'info') {
    if (!DOM.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 260);
    }, 3500);
  }

  // --------------------------------------------------------------------------
  // 11. EVENT LISTENERS
  // --------------------------------------------------------------------------

  function initEventListeners() {
    // --- Streamer Auth (PIN) ---
    if (DOM.btnOpenAdminAuth) {
      DOM.btnOpenAdminAuth.addEventListener('click', () => {
        if (DOM.inputAdminPin) DOM.inputAdminPin.value = '';
        openModal(DOM.modalAuth);
      });
    }

    if (DOM.btnCloseAuthModal) DOM.btnCloseAuthModal.addEventListener('click', () => closeModal(DOM.modalAuth));
    if (DOM.btnCancelAuthModal) DOM.btnCancelAuthModal.addEventListener('click', () => closeModal(DOM.modalAuth));

    if (DOM.formAuth) {
      DOM.formAuth.addEventListener('submit', (e) => {
        e.preventDefault();
        const enteredPin = DOM.inputAdminPin ? DOM.inputAdminPin.value.trim() : '';
        if (enteredPin === ADMIN_PIN) {
          setMode(true);
          closeModal(DOM.modalAuth);
          showToast('¡Modo Streamer / Admin desbloqueado!', 'success');
        } else {
          showToast('PIN incorrecto. Inténtalo de nuevo.', 'error');
          if (DOM.inputAdminPin) {
            DOM.inputAdminPin.value = '';
            DOM.inputAdminPin.focus();
          }
        }
      });
    }

    if (DOM.btnExitAdmin) {
      DOM.btnExitAdmin.addEventListener('click', () => {
        setMode(false);
        showToast('Has salido del modo Streamer', 'info');
      });
    }

    // --- Streamer Selection ---
    if (DOM.btnChangeStreamer) {
      DOM.btnChangeStreamer.addEventListener('click', () => {
        if (DOM.inputStreamerName) DOM.inputStreamerName.value = AppState.streamer;
        openModal(DOM.modalStreamer);
      });
    }

    if (DOM.btnCloseStreamerModal) DOM.btnCloseStreamerModal.addEventListener('click', () => closeModal(DOM.modalStreamer));
    if (DOM.btnCancelStreamerModal) DOM.btnCancelStreamerModal.addEventListener('click', () => closeModal(DOM.modalStreamer));

    if (DOM.formChangeStreamer) {
      DOM.formChangeStreamer.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = DOM.inputStreamerName ? DOM.inputStreamerName.value : '';
        if (val) {
          AppState.streamer = sanitizeStreamerName(val);
          syncUrlParams();
          updateKickViews();
          closeModal(DOM.modalStreamer);
          showToast(`Canal de Kick actualizado a "${AppState.streamer}"`, 'success');
        }
      });
    }

    document.querySelectorAll('.streamer-preset').forEach(chip => {
      chip.addEventListener('click', () => {
        const streamer = chip.getAttribute('data-streamer');
        if (DOM.inputStreamerName) DOM.inputStreamerName.value = streamer;
      });
    });

    // --- Video Modal ---
    const openVideoModalHandler = () => {
      if (DOM.inputVideoUrl) DOM.inputVideoUrl.value = AppState.videoUrl;
      openModal(DOM.modalVideo);
    };

    if (DOM.btnOpenVideoModal) DOM.btnOpenVideoModal.addEventListener('click', openVideoModalHandler);
    if (DOM.btnPlaceholderLoad) DOM.btnPlaceholderLoad.addEventListener('click', openVideoModalHandler);

    if (DOM.btnCloseVideoModal) DOM.btnCloseVideoModal.addEventListener('click', () => closeModal(DOM.modalVideo));
    if (DOM.btnCancelVideoModal) DOM.btnCancelVideoModal.addEventListener('click', () => closeModal(DOM.modalVideo));

    if (DOM.formLoadVideo) {
      DOM.formLoadVideo.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = DOM.inputVideoUrl ? DOM.inputVideoUrl.value : '';
        loadVideoSource(val);
        closeModal(DOM.modalVideo);
        showToast('Video cargado correctamente', 'success');
      });
    }

    // Demo video preset
    if (DOM.btnLoadDemo) {
      DOM.btnLoadDemo.addEventListener('click', () => {
        const demoUrl = 'https://www.youtube.com/watch?v=A8qw5r6aDYo';
        loadVideoSource(demoUrl);
        showToast('Video Demo cargado', 'success');
      });
    }

    document.querySelectorAll('.preset-chip[data-url]').forEach(chip => {
      chip.addEventListener('click', () => {
        const url = chip.getAttribute('data-url');
        if (DOM.inputVideoUrl) DOM.inputVideoUrl.value = url;
      });
    });

    // --- Webcam Controls ---
    if (DOM.btnToggleWebcamSize) DOM.btnToggleWebcamSize.addEventListener('click', cycleWebcamSize);
    if (DOM.btnCycleWebcamPos) DOM.btnCycleWebcamPos.addEventListener('click', cycleWebcamPosition);
    if (DOM.btnHideWebcam) DOM.btnHideWebcam.addEventListener('click', toggleWebcamVisibility);
    if (DOM.btnWebcamToggleFooter) DOM.btnWebcamToggleFooter.addEventListener('click', toggleWebcamVisibility);
    if (DOM.btnReloadKick) DOM.btnReloadKick.addEventListener('click', reloadKickPlayer);

    // --- Video Actions ---
    if (DOM.btnReloadMovie) DOM.btnReloadMovie.addEventListener('click', reloadMoviePlayer);
    if (DOM.btnFullscreenMovie) DOM.btnFullscreenMovie.addEventListener('click', () => toggleFullscreen(DOM.stageSection));

    // --- Chat Actions ---
    if (DOM.btnReloadChat) DOM.btnReloadChat.addEventListener('click', reloadKickChat);
    if (DOM.btnToggleChat) DOM.btnToggleChat.addEventListener('click', toggleChatColumn);
    if (DOM.btnCloseChatMobile) DOM.btnCloseChatMobile.addEventListener('click', toggleChatColumn);

    // --- Save & Publish Public Link ---
    if (DOM.btnSavePublish) {
      DOM.btnSavePublish.addEventListener('click', handleSaveAndPublish);
    }

    if (DOM.btnClosePublishModal) {
      DOM.btnClosePublishModal.addEventListener('click', () => closeModal(DOM.modalPublish));
    }

    if (DOM.btnCopyPublishUrl) {
      DOM.btnCopyPublishUrl.addEventListener('click', () => {
        const publicUrl = DOM.inputPublishUrl.value;
        navigator.clipboard.writeText(publicUrl).then(() => {
          showToast('¡Enlace público copiado al portapapeles!', 'success');
        }).catch(() => {
          DOM.inputPublishUrl.select();
          document.execCommand('copy');
          showToast('¡Enlace público copiado!', 'success');
        });
      });
    }

    if (DOM.btnPreviewViewer) {
      DOM.btnPreviewViewer.addEventListener('click', () => {
        const publicUrl = DOM.inputPublishUrl.value;
        window.open(publicUrl, '_blank');
      });
    }

    // --- Desbloqueo de Audio & Sync en Móviles / Viewers ---
    const btnUnlockSync = document.getElementById('btn-unlock-sync');
    if (btnUnlockSync) {
      btnUnlockSync.addEventListener('click', unlockViewerMobileAudio);
    }
    const viewerShield = document.getElementById('viewer-video-shield');
    if (viewerShield) {
      viewerShield.addEventListener('click', unlockViewerMobileAudio);
    }

    // --- Sync Guide Modal ---
    if (DOM.btnSyncGuide) DOM.btnSyncGuide.addEventListener('click', () => openModal(DOM.modalSync));
    if (DOM.btnCloseSyncModal) DOM.btnCloseSyncModal.addEventListener('click', () => closeModal(DOM.modalSync));
    if (DOM.btnDismissSyncModal) DOM.btnDismissSyncModal.addEventListener('click', () => closeModal(DOM.modalSync));

    // Close on backdrop / ESC
    [DOM.modalAuth, DOM.modalVideo, DOM.modalStreamer, DOM.modalPublish, DOM.modalSync].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal(modal);
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      // Ignorar si el usuario está escribiendo en un input o textarea
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isTyping = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === 'Escape') {
        closeModal(DOM.modalAuth);
        closeModal(DOM.modalVideo);
        closeModal(DOM.modalStreamer);
        closeModal(DOM.modalPublish);
        closeModal(DOM.modalSync);
      }

      // Atajo de teclado para Streamer: Ctrl + Shift + A
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (AppState.isAdmin) {
          setMode(false);
          showToast('Modo Espectador activado', 'info');
        } else {
          openModal(DOM.modalAuth);
        }
      }

      // Controles de tiempo rápidos para el Admin (Adelantar / Retroceder)
      if (AppState.isAdmin && !isTyping) {
        if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const curr = ytPlayerInstance.getCurrentTime() || 0;
            const newT = curr + 5;
            ytPlayerInstance.seekTo(newT, true);
            emitPlaybackSync(newT, ytPlayerInstance.getPlayerState() === 1);
            showToast('+5s Adelantado', 'info');
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const curr = ytPlayerInstance.getCurrentTime() || 0;
            const newT = Math.max(0, curr - 5);
            ytPlayerInstance.seekTo(newT, true);
            emitPlaybackSync(newT, ytPlayerInstance.getPlayerState() === 1);
            showToast('-5s Retrocedido', 'info');
          }
        }
      }
    });

    window.addEventListener('popstate', () => {
      parseUrlParams();
      updateKickViews();
      if (AppState.videoUrl) {
        loadVideoSource(AppState.videoUrl);
      } else {
        unloadVideo();
      }
    });

    initChatResizer();
    initWebcamDragAndResize();
    initRealtimeSyncListener();
  }

  // --------------------------------------------------------------------------
  // 12. INITIALIZATION
  // --------------------------------------------------------------------------

  function init() {
    parseUrlParams();
    initEventListeners();
    updateKickViews();

    if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
      loadVideoSource(AppState.videoUrl);
    } else {
      unloadVideo();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
