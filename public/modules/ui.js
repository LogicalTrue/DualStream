/**
 * ==========================================================================
 * UI MODULE
 * Modal handling, toasts, mode toggling, draggable webcam, and responsive layout.
 * ==========================================================================
 */

import { DOM } from './dom.js';
import { AppState, sanitizeStreamerName } from './state.js';
import { startAdminSessionChecker } from './api.js';

export function showToast(message, type = 'info') {
  if (!DOM.toastContainer) return;

  // Silenciar avisos rutinarios molestos de configuración guardada, modo, posición, etc.
  if (type !== 'error') {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 260);
  }, 3500);
}

export function openModal(modalElem) {
  if (!modalElem) return;
  modalElem.classList.add('active');
  modalElem.setAttribute('aria-hidden', 'false');
  const input = modalElem.querySelector('input, textarea');
  if (input) setTimeout(() => input.focus(), 100);
}

export function closeModal(modalElem) {
  if (!modalElem) return;
  modalElem.classList.remove('active');
  modalElem.setAttribute('aria-hidden', 'true');
}

export function setMode(isAdmin) {
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

export async function parseUrlParams() {
  const searchParams = new URLSearchParams(window.location.search);

  const storedSecret = sessionStorage.getItem('kick_dual_admin_secret');
  const storedSessionToken = sessionStorage.getItem('kick_dual_admin_session_token');
  const storedIsAdmin = sessionStorage.getItem('kick_dual_is_admin') === 'true';

  if (storedIsAdmin && storedSecret && storedSessionToken) {
    setMode(true);
    startAdminSessionChecker(() => {
      setMode(false);
      showToast('⚠️ Se ha iniciado sesión desde otro dispositivo. Tu sesión de admin se ha cerrado.', 'error');
    });
  } else {
    setMode(false);
    sessionStorage.removeItem('kick_dual_admin_secret');
    sessionStorage.removeItem('kick_dual_admin_session_token');
    sessionStorage.removeItem('kick_dual_is_admin');
  }

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

export function applyWebcamPosition() {
  if (!DOM.webcamCard) return;
  DOM.webcamCard.style.left = `${AppState.camX}%`;
  DOM.webcamCard.style.top = `${AppState.camY}%`;
  DOM.webcamCard.style.right = 'auto';
  DOM.webcamCard.style.bottom = 'auto';
  if (AppState.camW) {
    DOM.webcamCard.style.width = `${AppState.camW}%`;
  }
}

export function syncUrlParams() {
  const url = new URL(window.location.origin + window.location.pathname);
  window.history.replaceState({}, '', url.toString());
}

export function generatePublicViewerUrl() {
  return window.location.origin + window.location.pathname;
}

export function cycleWebcamPosition() {
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

export function cycleWebcamSize() {
  const sizes = [18, 26, 36];
  const currentIdx = sizes.findIndex(s => Math.abs(s - AppState.camW) < 5);
  const nextIdx = (currentIdx + 1) % sizes.length;

  AppState.camW = sizes[nextIdx];
  applyWebcamPosition();

  const names = ['Chica', 'Mediana', 'Grande'];
  showToast(`Webcam: Tamaño ${names[nextIdx]}`, 'info');
}

export function toggleWebcamVisibility() {
  AppState.webcamVisible = !AppState.webcamVisible;
  if (AppState.webcamVisible) {
    if (DOM.webcamCard) DOM.webcamCard.classList.remove('hidden');
    if (DOM.btnWebcamToggleFooter) DOM.btnWebcamToggleFooter.classList.add('active');
    showToast('Webcam visible', 'info');
  } else {
    if (DOM.webcamCard) DOM.webcamCard.classList.add('hidden');
    if (DOM.btnWebcamToggleFooter) DOM.btnWebcamToggleFooter.classList.remove('active');
    showToast('Webcam oculta', 'info');
  }
}

export function initWebcamDragAndResize(onPositionChanged) {
  let isDragging = false;
  let isResizing = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;
  let initialWidth = 0;

  const onDragStart = (e) => {
    if (!AppState.isAdmin) return;
    if (e.target.closest('#webcam-resize-handle') || e.target.closest('.webcam-header-actions')) return;

    isDragging = true;
    if (DOM.webcamCard) DOM.webcamCard.classList.add('is-dragging');
    if (DOM.kickPlayerFrame) DOM.kickPlayerFrame.style.pointerEvents = 'none';

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;

    const container = DOM.moviePlayerBox || DOM.videoTheater;
    const cardRect = DOM.webcamCard.getBoundingClientRect();
    const parentRect = container.getBoundingClientRect();

    initialLeft = cardRect.left - parentRect.left;
    initialTop = cardRect.top - parentRect.top;

    e.preventDefault();
  };

  const onMouseMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const container = DOM.moviePlayerBox || DOM.videoTheater;
    const parentRect = container.getBoundingClientRect();

    if (isDragging) {
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      const cardWidth = DOM.webcamCard.offsetWidth;
      const cardHeight = DOM.webcamCard.offsetHeight;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      if (newLeft < 0) newLeft = 0;
      if (newTop < 0) newTop = 0;
      if (newLeft + cardWidth > parentRect.width) newLeft = parentRect.width - cardWidth;
      if (newTop + cardHeight > parentRect.height) newTop = parentRect.height - cardHeight;

      AppState.camX = parseFloat(((newLeft / parentRect.width) * 100).toFixed(2));
      AppState.camY = parseFloat(((newTop / parentRect.height) * 100).toFixed(2));

      DOM.webcamCard.style.left = `${AppState.camX}%`;
      DOM.webcamCard.style.top = `${AppState.camY}%`;
    } else if (isResizing) {
      const deltaX = clientX - startX;
      let newW = initialWidth + deltaX;

      if (newW < 80) newW = 80;
      if (newW > parentRect.width * 0.85) newW = parentRect.width * 0.85;

      AppState.camW = parseFloat(((newW / parentRect.width) * 100).toFixed(2));
      DOM.webcamCard.style.width = `${AppState.camW}%`;
    }
  };

  const onMouseUp = () => {
    if (isDragging || isResizing) {
      isDragging = false;
      isResizing = false;
      if (DOM.webcamCard) DOM.webcamCard.classList.remove('is-dragging');
      if (DOM.kickPlayerFrame) DOM.kickPlayerFrame.style.pointerEvents = 'auto';
      if (AppState.isAdmin && typeof onPositionChanged === 'function') {
        onPositionChanged();
      }
    }
  };

  const onResizeStart = (e) => {
    if (!AppState.isAdmin) return;
    isResizing = true;
    if (DOM.kickPlayerFrame) DOM.kickPlayerFrame.style.pointerEvents = 'none';

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

export function toggleChatColumn() {
  AppState.chatVisible = !AppState.chatVisible;
  if (AppState.chatVisible) {
    if (DOM.chatColumn) DOM.chatColumn.classList.remove('collapsed');
    document.body.classList.remove('chat-is-hidden');
    document.body.classList.remove('chat-is-closed');
    document.body.classList.add('landscape-chat-open');
    if (DOM.chatResizer) DOM.chatResizer.style.display = 'flex';
    if (DOM.btnToggleChat) DOM.btnToggleChat.classList.add('active');
  } else {
    if (DOM.chatColumn) DOM.chatColumn.classList.add('collapsed');
    document.body.classList.add('chat-is-hidden');
    document.body.classList.add('chat-is-closed');
    document.body.classList.remove('landscape-chat-open');
    if (DOM.chatResizer) DOM.chatResizer.style.display = 'none';
    if (DOM.btnToggleChat) DOM.btnToggleChat.classList.remove('active');
  }
}

export function openChat() {
  AppState.chatVisible = true;
  if (DOM.chatColumn) DOM.chatColumn.classList.remove('collapsed');
  document.body.classList.remove('chat-is-closed');
  document.body.classList.remove('chat-is-hidden');
  document.body.classList.add('landscape-chat-open');
  if (DOM.btnToggleChat) DOM.btnToggleChat.classList.add('active');
}

export function closeChat() {
  AppState.chatVisible = false;
  if (DOM.chatColumn) DOM.chatColumn.classList.add('collapsed');
  document.body.classList.add('chat-is-closed');
  document.body.classList.add('chat-is-hidden');
  document.body.classList.remove('landscape-chat-open');
  if (DOM.btnToggleChat) DOM.btnToggleChat.classList.remove('active');
}

export function initChatResizer() {
  let isDragging = false;

  const onDragStart = (e) => {
    isDragging = true;
    if (DOM.chatResizer) DOM.chatResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onDragMove = (e) => {
    if (!isDragging || !DOM.watchContainer) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const containerRect = DOM.watchContainer.getBoundingClientRect();
    let newChatWidth = containerRect.right - clientX;

    const minW = window.innerWidth < 768 ? 160 : 240;
    const maxW = window.innerWidth < 768 ? Math.min(420, window.innerWidth * 0.65) : 580;

    if (newChatWidth < minW) newChatWidth = minW;
    if (newChatWidth > maxW) newChatWidth = maxW;

    AppState.chatWidth = newChatWidth;
    document.documentElement.style.setProperty('--chat-width', `${newChatWidth}px`);
  };

  const onDragEnd = () => {
    if (isDragging) {
      isDragging = false;
      if (DOM.chatResizer) DOM.chatResizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  };

  if (DOM.chatResizer) {
    DOM.chatResizer.addEventListener('mousedown', onDragStart);
    DOM.chatResizer.addEventListener('touchstart', onDragStart, { passive: false });
  }

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchend', onDragEnd);
}
