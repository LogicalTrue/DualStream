/**
 * ==========================================================================
 * STATE MODULE
 * Application state, default configuration, and state helpers.
 * ==========================================================================
 */

import { DOM } from './dom.js';

// Clave de almacenamiento persistente
export const STORAGE_KEY = 'kick_dual_streamer_config';
export const SYNC_CHANNEL_NAME = 'kick_dual_watch_party_sync';

// Canal de difusión en tiempo real entre pestañas / navegadores
export let syncChannel = null;
try {
  if (typeof window !== 'undefined' && window.BroadcastChannel) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel no soportado, usando fallback StorageEvent', e);
}

// Canal de eventos en vivo en tiempo real (EventSource / SSE)
export const CLOUD_SYNC_TOPIC = 'https://ntfy.sh/dualstream_wp_official_v3';

// Configuración inicial / por defecto (blackozutr)
export const DEFAULT_CONFIG = {
  streamer: 'blackozutr',
  videoUrl: 'https://www.youtube.com/watch?v=A8qw5r6aDYo',
  camX: 2, // %
  camY: 3, // %
  camW: 26 // %
};

export const DEFAULT_STREAMER = DEFAULT_CONFIG.streamer;
export const DEFAULT_VIDEO = DEFAULT_CONFIG.videoUrl;

/**
 * Obtiene la configuración guardada por el admin
 */
export function loadPersistedConfig() {
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

const persisted = loadPersistedConfig();

export const AppState = {
  isAdmin: false,
  isOnline: false,
  isViewerConnected: false,
  offlineImg: persisted.offlineImg || '',
  onlineImg: persisted.onlineImg || '',
  streamer: persisted.streamer || DEFAULT_STREAMER,
  videoUrl: '',
  chatVisible: true,
  webcamVisible: true,
  camX: persisted.camX !== undefined ? persisted.camX : 2,
  camY: persisted.camY !== undefined ? persisted.camY : 3,
  camW: persisted.camW !== undefined ? persisted.camW : 26,
  chatWidth: 320
};

export function sanitizeStreamerName(input) {
  if (!input) return DEFAULT_STREAMER;
  let clean = input.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\/(www\.)?kick\.com\//i, '');
  clean = clean.replace(/\/chatroom.*$/i, '');
  clean = clean.replace(/[\/\?#].*$/, '');
  clean = clean.replace(/[^a-z0-9_]/g, '');
  return clean || DEFAULT_STREAMER;
}
