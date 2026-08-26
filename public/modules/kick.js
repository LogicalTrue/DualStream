import { DOM } from './dom.js';
import { AppState, DEFAULT_STREAMER } from './state.js';
import { showToast } from './ui.js';

export function updateKickViews() {
  const channel = AppState.streamer || DEFAULT_STREAMER;

  const chatUrl = `https://chat.kick.cx/embed/${encodeURIComponent(channel)}`;
  if (DOM.kickChatFrame && DOM.kickChatFrame.src !== chatUrl) {
    DOM.kickChatFrame.src = chatUrl;
  }

  const playerUrl = `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=true`;
  if (DOM.kickPlayerFrame && DOM.kickPlayerFrame.src !== playerUrl) {
    DOM.kickPlayerFrame.src = playerUrl;
  }
}

export function reloadKickChat() {
  if (!DOM.kickChatFrame) return;
  const currentSrc = DOM.kickChatFrame.src;
  DOM.kickChatFrame.src = 'about:blank';
  setTimeout(() => {
    DOM.kickChatFrame.src = currentSrc;
    showToast('Chat de Kick recargado', 'success');
  }, 150);
}
