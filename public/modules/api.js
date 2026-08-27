import { STREAM_CONFIG } from '../stream-config.js';

export const SYNC_API_ENDPOINT = '/api/sync';

export async function fetchLatestCloudState() {
  const urlParam = STREAM_CONFIG && STREAM_CONFIG.videoUrl ? `&url=${encodeURIComponent(STREAM_CONFIG.videoUrl)}` : '';
  return fetch(`${SYNC_API_ENDPOINT}?t=${Date.now()}${urlParam}`, { cache: 'no-store' });
}
