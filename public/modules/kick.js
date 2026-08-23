/**
 * ==========================================================================
 * KICK VIEWS MODULE
 * Stream player, chat popout, and channel update logic.
 * ==========================================================================
 */

import { DOM } from './dom.js';
import { AppState, DEFAULT_STREAMER } from './state.js';
import { showToast } from './ui.js';

export function updateKickViews() {
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

  // Kick Stream Player oficial (Webcam)
  const playerUrl = `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true`;
  if (DOM.kickPlayerFrame && DOM.kickPlayerFrame.src !== playerUrl) {
    DOM.kickPlayerFrame.src = playerUrl;
  }

  // Kick Background Stream & Chat (1x1 px para asegurar views de Kick en todo momento, igual a MiluLive)
  const bgFrame = document.getElementById('kick-background-frame');
  const bgUrl = `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=true&allowfullscreen=false`;
  if (bgFrame && bgFrame.src !== bgUrl) {
    bgFrame.src = bgUrl;
  }

  const bgChatFrame = document.getElementById('kick-background-chat-frame');
  const bgChatUrl = `https://kick.com/popout/${encodeURIComponent(channel)}/chat`;
  if (bgChatFrame && bgChatFrame.src !== bgChatUrl) {
    bgChatFrame.src = bgChatUrl;
  }

  // Kick Popout Live Chat (Exacto de MiluLive con 7TV y Login OAuth integrado: https://chat.kick.cx/embed/{streamer})
  const chatUrl = `https://chat.kick.cx/embed/${encodeURIComponent(channel)}`;
  if (DOM.kickChatFrame && DOM.kickChatFrame.src !== chatUrl) {
    DOM.kickChatFrame.src = chatUrl;
  }
}

export function reloadKickPlayer() {
  if (!DOM.kickPlayerFrame) return;
  const currentSrc = DOM.kickPlayerFrame.src;
  DOM.kickPlayerFrame.src = 'about:blank';
  setTimeout(() => {
    DOM.kickPlayerFrame.src = currentSrc;
    showToast('Webcam de Kick recargada', 'success');
  }, 150);
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

export function unmuteKickStream() {
  if (!DOM.kickPlayerFrame) return;
  const channel = AppState.streamer || DEFAULT_STREAMER;
  DOM.kickPlayerFrame.src = `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=false`;
  showToast('🔊 Audio de Kick activado', 'success');
}
