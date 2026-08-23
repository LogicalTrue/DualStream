/**
 * ==========================================================================
 * STATE MODULE
 * Application state, default configuration, and state helpers.
 * ==========================================================================
 */

import { DOM } from './dom.js';
import { STREAM_CONFIG } from '../stream-config.js';

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

// Configuración inicial master (BlackozuTR)
export const DEFAULT_CONFIG = {
  streamer: STREAM_CONFIG.kickChannel || 'BlackozuTR',
  videoUrl: STREAM_CONFIG.videoUrl || 'https://62-238-122-186.sslip.io/live/stream/index.m3u8',
  camX: 2, // %
  camY: 3, // %
  camW: 26 // %
};

export const DEFAULT_STREAMER = DEFAULT_CONFIG.streamer;
export const DEFAULT_VIDEO = DEFAULT_CONFIG.videoUrl;

/**
 * Obtiene la configuración master de STREAM_CONFIG
 */
export function loadPersistedConfig() {
  return { ...DEFAULT_CONFIG };
}

const persisted = loadPersistedConfig();

export const AppState = {
  isAdmin: false,
  isOnline: true,
  isViewerConnected: true,
  offlineImg: STREAM_CONFIG.offlinePoster || '',
  onlineImg: STREAM_CONFIG.onlinePoster || '',
  streamer: STREAM_CONFIG.kickChannel || 'BlackozuTR',
  videoUrl: STREAM_CONFIG.videoUrl || '',
  chatVisible: true,
  webcamVisible: true,
  camX: 2,
  camY: 3,
  camW: 26,
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
