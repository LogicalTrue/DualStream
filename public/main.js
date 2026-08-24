/**
 * ==========================================================================
 * MAIN MODULE (ORCHESTRATOR)
 * Application lifecycle, event listeners, and telemetry bridge.
 * ==========================================================================
 */

import { DOM } from './modules/dom.js';
import { AppState, sanitizeStreamerName } from './modules/state.js';
import { verifyAdminAuth, logoutAdmin, uploadMp4ToCatbox, startAdminSessionChecker, fetchLatestCloudState } from './modules/api.js';
import { updateKickViews, reloadKickPlayer, reloadKickChat, unmuteKickStream } from './modules/kick.js';
import { STREAM_CONFIG } from './stream-config.js';
import {
  loadVideoSource,
  unloadVideo,
  unlockViewerMobileAudio,
  updateVideoVolume,
  toggleFullscreen,
  reloadMoviePlayer,
  ytPlayerInstance,
  activeNativeVideo
} from './modules/player.js';
import {
  showToast,
  openModal,
  closeModal,
  setMode,
  parseUrlParams,
  applyWebcamPosition,
  syncUrlParams,
  generatePublicViewerUrl,
  cycleWebcamPosition,
  cycleWebcamSize,
  toggleWebcamVisibility,
  initWebcamDragAndResize,
  toggleChatColumn,
  openChat,
  closeChat,
  initChatResizer
} from './modules/ui.js';
import {
  saveAndBroadcastConfig,
  emitPlaybackSync,
  initRealtimeSyncListener,
  latestSyncPlaybackState,
  getLatestSyncState
} from './modules/sync.js';

function handleSaveAndPublish() {
  saveAndBroadcastConfig();
  const publicUrl = generatePublicViewerUrl();
  if (DOM.inputPublishUrl) {
    DOM.inputPublishUrl.value = publicUrl;
  }
  openModal(DOM.modalPublish);
  showToast('¡Configuración guardada y transmitida en vivo a todos los espectadores!', 'success');
}

function initEventListeners() {
  // Panel de Admin oculto para entrega de cliente (configurado vía stream-config.js)

  if (DOM.btnCloseAuthModal) DOM.btnCloseAuthModal.addEventListener('click', () => closeModal(DOM.modalAuth));
  if (DOM.btnCancelAuthModal) DOM.btnCancelAuthModal.addEventListener('click', () => closeModal(DOM.modalAuth));

  if (DOM.formAuth) {
    DOM.formAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredSecret = DOM.inputAdminPin ? DOM.inputAdminPin.value.trim() : '';
      if (!enteredSecret) return;

      showToast('Verificando clave...', 'info');
      try {
        const res = await verifyAdminAuth(enteredSecret);

        if (res.ok) {
          const data = await res.json();
          sessionStorage.setItem('kick_dual_admin_secret', enteredSecret);
          if (data && data.sessionToken) {
            sessionStorage.setItem('kick_dual_admin_session_token', data.sessionToken);
          }
          setMode(true);
          closeModal(DOM.modalAuth);
          showToast('¡Modo Streamer / Admin desbloqueado exitosamente!', 'success');
          startAdminSessionChecker(() => {
            setMode(false);
            showToast('⚠️ Se ha iniciado sesión desde otro dispositivo. Tu sesión de admin se ha cerrado.', 'error');
          });
        } else {
          showToast('Clave secreta incorrecta. Inténtalo de nuevo.', 'error');
          if (DOM.inputAdminPin) {
            DOM.inputAdminPin.value = '';
            DOM.inputAdminPin.focus();
          }
        }
      } catch (err) {
        showToast('Error de conexión al verificar la clave.', 'error');
      }
    });
  }

  if (DOM.btnExitAdmin) {
    DOM.btnExitAdmin.addEventListener('click', async () => {
      await logoutAdmin();
      sessionStorage.removeItem('kick_dual_admin_secret');
      sessionStorage.removeItem('kick_dual_admin_session_token');
      setMode(false);
      AppState.isOnline = false;
      showToast('Has salido del modo Streamer. La Watch Party ahora está fuera de línea.', 'info');
    });
  }

  // --- Unified Configuration Modal (Kick + Video + Save) ---
  const openConfigModalHandler = () => {
    if (DOM.inputConfigStreamer) DOM.inputConfigStreamer.value = AppState.streamer || '';
    if (DOM.inputConfigVideo) DOM.inputConfigVideo.value = AppState.videoUrl || '';
    if (DOM.inputConfigOfflineImg) DOM.inputConfigOfflineImg.value = AppState.offlineImg || '';
    if (DOM.inputConfigOnlineImg) DOM.inputConfigOnlineImg.value = AppState.onlineImg || '';
    openModal(DOM.modalConfig);
  };

  if (DOM.btnOpenConfigModal) DOM.btnOpenConfigModal.addEventListener('click', openConfigModalHandler);
  if (DOM.btnCloseConfigModal) DOM.btnCloseConfigModal.addEventListener('click', () => closeModal(DOM.modalConfig));
  if (DOM.btnCancelConfigModal) DOM.btnCancelConfigModal.addEventListener('click', () => closeModal(DOM.modalConfig));

  if (DOM.formConfig) {
    DOM.formConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const streamerVal = DOM.inputConfigStreamer ? DOM.inputConfigStreamer.value.trim() : '';
      const videoVal = DOM.inputConfigVideo ? DOM.inputConfigVideo.value.trim() : '';
      const offlineVal = DOM.inputConfigOfflineImg ? DOM.inputConfigOfflineImg.value.trim() : '';
      const onlineVal = DOM.inputConfigOnlineImg ? DOM.inputConfigOnlineImg.value.trim() : '';

      if (streamerVal) {
        AppState.streamer = sanitizeStreamerName(streamerVal);
        updateKickViews();
      }

      if (videoVal) {
        loadVideoSource(videoVal);
      } else if (AppState.videoUrl && !videoVal) {
        unloadVideo();
      }

      AppState.offlineImg = offlineVal;
      AppState.onlineImg = onlineVal;
      AppState.isOnline = true;

      syncUrlParams();
      saveAndBroadcastConfig();
      closeModal(DOM.modalConfig);
    });
  }

  // --- Subida de Archivos MP4 Directos desde la PC ---
  const inputMp4File = document.getElementById('input-mp4-file');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadFilename = document.getElementById('upload-filename');
  const uploadPercentage = document.getElementById('upload-percentage');
  const uploadProgressBar = document.getElementById('upload-progress-bar');

  if (btnBrowseFile && inputMp4File) {
    btnBrowseFile.addEventListener('click', () => inputMp4File.click());
  }

  if (uploadDropzone && inputMp4File) {
    uploadDropzone.addEventListener('click', (e) => {
      if (e.target !== btnBrowseFile) inputMp4File.click();
    });

    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.classList.add('dragover');
    });

    uploadDropzone.addEventListener('dragleave', () => {
      uploadDropzone.classList.remove('dragover');
    });

    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    inputMp4File.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    if (!file) return;

    if (uploadProgressContainer) uploadProgressContainer.style.display = 'block';
    if (uploadFilename) uploadFilename.textContent = `Subiendo: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`;
    if (uploadPercentage) uploadPercentage.textContent = '0%';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';

    uploadMp4ToCatbox(file, {
      onProgress: (percent) => {
        if (uploadPercentage) uploadPercentage.textContent = `${percent}%`;
        if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
      },
      onSuccess: (directUrl) => {
        if (DOM.inputConfigVideo) {
          DOM.inputConfigVideo.value = directUrl;
        }
        if (uploadFilename) uploadFilename.textContent = `✅ ¡Video subido con éxito! Enlace generado.`;
        if (uploadPercentage) uploadPercentage.textContent = '100%';
        showToast(`¡Video "${file.name}" subido exitosamente! Enlace listo para guardar.`, 'success');
      },
      onError: (err) => {
        if (uploadFilename) uploadFilename.textContent = `❌ Error al subir el video`;
        showToast('Error al subir el archivo. Intenta de nuevo.', 'error');
      }
    });
  }

  document.querySelectorAll('.config-video-preset').forEach(chip => {
    chip.addEventListener('click', () => {
      const url = chip.getAttribute('data-url');
      if (DOM.inputConfigVideo) DOM.inputConfigVideo.value = url;
    });
  });

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
        saveAndBroadcastConfig();
        closeModal(DOM.modalStreamer);
        showToast(`Canal de Kick actualizado a "${AppState.streamer}" y sincronizado con espectadores`, 'success');
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
  if (DOM.btnPlaceholderLoad) DOM.btnPlaceholderLoad.addEventListener('click', openConfigModalHandler);

  if (DOM.btnCloseVideoModal) DOM.btnCloseVideoModal.addEventListener('click', () => closeModal(DOM.modalVideo));
  if (DOM.btnCancelVideoModal) DOM.btnCancelVideoModal.addEventListener('click', () => closeModal(DOM.modalVideo));

  if (DOM.formLoadVideo) {
    DOM.formLoadVideo.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = DOM.inputVideoUrl ? DOM.inputVideoUrl.value : '';
      loadVideoSource(val);
      saveAndBroadcastConfig();
      closeModal(DOM.modalVideo);
      showToast('Video cargado y sincronizado con espectadores', 'success');
    });
  }

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

  // --- Webcam Controls & Audio ---
  const btnUnmuteKickStream = document.getElementById('btn-unmute-kick-stream');
  const btnQuickReloadKick = document.getElementById('btn-quick-reload-kick');

  if (btnUnmuteKickStream) {
    btnUnmuteKickStream.addEventListener('click', (e) => {
      e.stopPropagation();
      unmuteKickStream();
    });
  }

  if (btnQuickReloadKick) {
    btnQuickReloadKick.addEventListener('click', (e) => {
      e.stopPropagation();
      reloadKickPlayer();
    });
  }

  if (DOM.btnToggleWebcamSize) DOM.btnToggleWebcamSize.addEventListener('click', cycleWebcamSize);
  if (DOM.btnCycleWebcamPos) DOM.btnCycleWebcamPos.addEventListener('click', cycleWebcamPosition);
  if (DOM.btnHideWebcam) DOM.btnHideWebcam.addEventListener('click', toggleWebcamVisibility);
  if (DOM.btnWebcamToggleFooter) DOM.btnWebcamToggleFooter.addEventListener('click', toggleWebcamVisibility);
  if (DOM.btnReloadKick) DOM.btnReloadKick.addEventListener('click', reloadKickPlayer);

  // --- Video Actions & Volume Control ---
  const btnToggleVideoMute = document.getElementById('btn-toggle-video-mute');
  const sliderVideoVolume = document.getElementById('slider-video-volume');

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
        showToast('🔊 Audio activado al 100%', 'success');
      } else {
        if (sliderVideoVolume) sliderVideoVolume.value = 0;
        updateVideoVolume(0);
        showToast('🔇 Audio silenciado', 'info');
      }
    });
  }

  if (DOM.btnFullscreenMovie) {
    const onFsClick = (e) => {
      e.stopPropagation();
      toggleFullscreen(DOM.stageSection || document.getElementById('stage-section'));
    };
    DOM.btnFullscreenMovie.addEventListener('click', onFsClick);
  }

  // --- Chat Actions ---
  if (DOM.btnReloadChat) DOM.btnReloadChat.addEventListener('click', reloadKickChat);
  if (DOM.btnToggleChat) DOM.btnToggleChat.addEventListener('click', toggleChatColumn);
  if (DOM.btnReopenChat) DOM.btnReopenChat.addEventListener('click', toggleChatColumn);
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

  // --- Botón de Conectarse a la Watch Party (Espectadores) ---
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

      showToast('🎉 ¡Conectado con éxito a la Watch Party en vivo!', 'success');
    });
  }

  // --- Desbloqueo de Audio & Sync en Móviles / Viewers ---
  const btnUnlockSync = document.getElementById('btn-unlock-sync');
  if (btnUnlockSync) {
    btnUnlockSync.addEventListener('click', () => unlockViewerMobileAudio(getLatestSyncState()));
  }
  const viewerShield = document.getElementById('viewer-video-shield');
  if (viewerShield) {
    viewerShield.addEventListener('click', () => unlockViewerMobileAudio(getLatestSyncState()));
  }

  const btnFloatingChat = document.getElementById('btn-floating-chat-toggle');
  if (btnFloatingChat) {
    btnFloatingChat.addEventListener('click', openChat);
  }

  const btnCloseChatMobile = document.getElementById('btn-close-chat-mobile');
  if (btnCloseChatMobile) {
    btnCloseChatMobile.addEventListener('click', closeChat);
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
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTyping = activeTag === 'input' || activeTag === 'textarea';

    if (e.key === 'Escape') {
      closeModal(DOM.modalAuth);
      closeModal(DOM.modalVideo);
      closeModal(DOM.modalStreamer);
      closeModal(DOM.modalPublish);
      closeModal(DOM.modalSync);
    }

    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      if (AppState.isAdmin) {
        setMode(false);
        showToast('Modo Espectador activado', 'info');
      } else {
        openModal(DOM.modalAuth);
      }
    }

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
      loadVideoSource(AppState.videoUrl, getLatestSyncState());
    } else {
      unloadVideo();
    }
  });

  initChatResizer();
  initWebcamDragAndResize(saveAndBroadcastConfig);
  initRealtimeSyncListener();
}

async function init() {
  await parseUrlParams();
  initEventListeners();

  // Cargar configuración central de STREAM_CONFIG (archivo editable para cliente)
  if (STREAM_CONFIG) {
    if (STREAM_CONFIG.kickChannel) AppState.streamer = STREAM_CONFIG.kickChannel;
    if (STREAM_CONFIG.videoUrl) AppState.videoUrl = STREAM_CONFIG.videoUrl;
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

  // Inicializar views de Kick y chat oficial
  updateKickViews();

  // Antes de tocar el player, confirmar server-side si el stream está online.
  // Evita que el navegador dispare un primer intento "a ciegas" contra el .m3u8
  // (con el AppState.isOnline optimista por defecto) que generaría un 404 visible
  // en consola incluso cuando el stream ya está en vivo.
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

  // Cargar transmisión de video (HLS / m3u8 de OBS)
  if (AppState.videoUrl && AppState.videoUrl.trim() !== '') {
    loadVideoSource(AppState.videoUrl);
  }

  const currentName = AppState.streamer || 'BlackozuTR';
  if (DOM.currentStreamerLabel) DOM.currentStreamerLabel.textContent = currentName;
  if (DOM.offlineStreamerName) DOM.offlineStreamerName.textContent = currentName;
  if (DOM.onlineStreamerName) DOM.onlineStreamerName.textContent = currentName;

  if (DOM.offlineBackdrop && AppState.offlineImg) {
    DOM.offlineBackdrop.style.backgroundImage = `url('${AppState.offlineImg}')`;
  }
  if (DOM.onlineBackdrop && AppState.onlineImg) {
    DOM.onlineBackdrop.style.backgroundImage = `url('${AppState.onlineImg}')`;
  }
}

// Exponer telemetría para bots y tests
window.__DualStreamState__ = {
  getAppState: () => AppState,
  getPlayer: () => ytPlayerInstance,
  getLatestSync: () => latestSyncPlaybackState,
  getCurrentState: () => {
    let isPlaying = false;
    let currentTime = 0;
    if (ytPlayerInstance && typeof ytPlayerInstance.getPlayerState === 'function') {
      const s = ytPlayerInstance.getPlayerState();
      isPlaying = (s === 1 || s === 3);
      currentTime = ytPlayerInstance.getCurrentTime() || 0;
    } else if (latestSyncPlaybackState) {
      isPlaying = Boolean(latestSyncPlaybackState.isPlaying);
      currentTime = latestSyncPlaybackState.currentTime || 0;
    }
    return {
      streamer: AppState.streamer,
      videoUrl: AppState.videoUrl,
      isPlaying,
      currentTime: parseFloat(currentTime.toFixed(2))
    };
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
