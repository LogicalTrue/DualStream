import { STREAM_CONFIG } from '../stream-config.js';

export const DEFAULT_CONFIG = {
  streamer: STREAM_CONFIG.kickChannel || 'BlackozuTR',
  videoUrl: STREAM_CONFIG.videoUrl || 'https://stream-blackozu.b-cdn.net/app/stream/llhls.m3u8',
  offlinePoster: STREAM_CONFIG.offlinePoster || 'https://i.imgur.com/WZFLjFB.jpeg',
  onlinePoster: STREAM_CONFIG.onlinePoster || ''
};

export const DEFAULT_STREAMER = DEFAULT_CONFIG.streamer;
export const DEFAULT_VIDEO = DEFAULT_CONFIG.videoUrl;

export const AppState = {
  isOnline: true,
  isViewerConnected: true,
  offlineImg: STREAM_CONFIG.offlinePoster || 'https://i.imgur.com/WZFLjFB.jpeg',
  onlineImg: STREAM_CONFIG.onlinePoster || '',
  streamer: STREAM_CONFIG.kickChannel || 'BlackozuTR',
  videoUrl: STREAM_CONFIG.videoUrl || '',
  chatVisible: true,
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
