export const SYNC_API_ENDPOINT = '/api/sync';

export async function fetchLatestCloudState() {
  return fetch(SYNC_API_ENDPOINT + '?t=' + Date.now(), { cache: 'no-store' });
}
