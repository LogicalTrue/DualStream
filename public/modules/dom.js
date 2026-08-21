/**
 * ==========================================================================
 * DOM MODULE
 * Centralized mapping of all document elements.
 * ==========================================================================
 */

export const DOM = {
  // Standby Screens
  theaterOfflineScreen: document.getElementById('theater-offline-screen'),
  offlineBackdrop: document.getElementById('offline-backdrop'),
  offlineStreamerName: document.getElementById('offline-streamer-name'),
  theaterOnlineScreen: document.getElementById('theater-online-screen'),
  onlineBackdrop: document.getElementById('online-backdrop'),
  onlineStreamerName: document.getElementById('online-streamer-name'),
  btnConnectWatchparty: document.getElementById('btn-connect-watchparty'),
  inputConfigOfflineImg: document.getElementById('input-config-offline-img'),
  inputConfigOnlineImg: document.getElementById('input-config-online-img'),

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
  btnReopenChat: document.getElementById('btn-reopen-chat'),
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

  // Unified Config Modal (Streamer + Video + Save)
  modalConfig: document.getElementById('modal-config'),
  btnOpenConfigModal: document.getElementById('btn-open-config-modal'),
  formConfig: document.getElementById('form-config'),
  inputConfigStreamer: document.getElementById('input-config-streamer'),
  inputConfigVideo: document.getElementById('input-config-video'),
  btnCloseConfigModal: document.getElementById('btn-close-config-modal'),
  btnCancelConfigModal: document.getElementById('btn-cancel-config-modal'),

  modalSync: document.getElementById('modal-sync'),
  btnCloseSyncModal: document.getElementById('btn-close-sync-modal'),
  btnDismissSyncModal: document.getElementById('btn-dismiss-sync-modal'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
};
