import { DOM } from './dom.js';
import { AppState, sanitizeStreamerName } from './state.js';

export function showToast(message, type = 'info') {
  if (!DOM.toastContainer) return;

  if (type !== 'error') {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 260);
  }, 3500);
}

export function parseUrlParams() {
  const searchParams = new URLSearchParams(window.location.search);

  const rawStreamer = searchParams.get('streamer');
  if (rawStreamer && rawStreamer.trim() !== '') {
    AppState.streamer = sanitizeStreamerName(rawStreamer);
  }

  const rawVideo = searchParams.get('video');
  if (rawVideo && rawVideo.trim() !== '') {
    AppState.videoUrl = decodeURIComponent(rawVideo.trim());
  }
}

export function toggleFullscreen(element) {
  const target = element || document.documentElement;
  if (!document.fullscreenElement) {
    if (target.requestFullscreen) {
      target.requestFullscreen().catch(() => {});
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
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

  const onDragStart = () => {
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
