/**
 * ==========================================================================
 * API MODULE
 * Backend integration (/api/sync), auth verification, and file uploads.
 * ==========================================================================
 */

import { AppState } from './state.js';

export const SYNC_API_ENDPOINT = '/api/sync';

let sessionCheckInterval = null;

export function startAdminSessionChecker(onRevoked) {
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);

  sessionCheckInterval = setInterval(async () => {
    if (!AppState.isAdmin) {
      clearInterval(sessionCheckInterval);
      return;
    }

    const adminSecret = sessionStorage.getItem('kick_dual_admin_secret');
    const sessionToken = sessionStorage.getItem('kick_dual_admin_session_token');
    if (!adminSecret || !sessionToken) return;

    try {
      const res = await fetch(SYNC_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminSecret}`,
          'x-admin-session': sessionToken
        },
        body: JSON.stringify({ type: 'CHECK_SESSION' })
      });

      if (res.status === 403) {
        clearInterval(sessionCheckInterval);
        sessionStorage.removeItem('kick_dual_admin_secret');
        sessionStorage.removeItem('kick_dual_admin_session_token');
        if (typeof onRevoked === 'function') onRevoked();
      }
    } catch (e) {}
  }, 6000);
}

export function stopAdminSessionChecker() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

export async function verifyAdminAuth(enteredSecret) {
  return fetch(SYNC_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${enteredSecret}`
    },
    body: JSON.stringify({ type: 'VERIFY_AUTH' })
  });
}

export async function logoutAdmin() {
  const adminSecret = sessionStorage.getItem('kick_dual_admin_secret') || '';
  const sessionToken = sessionStorage.getItem('kick_dual_admin_session_token') || '';
  try {
    await fetch(SYNC_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminSecret ? `Bearer ${adminSecret}` : '',
        'x-admin-session': sessionToken
      },
      body: JSON.stringify({ type: 'LOGOUT' })
    });
  } catch (e) {}
}

export function sendCloudConfig(configPayload) {
  const adminSecret = sessionStorage.getItem('kick_dual_admin_secret') || '';
  const sessionToken = sessionStorage.getItem('kick_dual_admin_session_token') || '';
  return fetch(SYNC_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': adminSecret ? `Bearer ${adminSecret}` : '',
      'x-admin-session': sessionToken
    },
    body: JSON.stringify(configPayload)
  });
}

export async function fetchLatestCloudState() {
  return fetch(SYNC_API_ENDPOINT + '?t=' + Date.now(), { cache: 'no-store' });
}

export function uploadMp4ToCatbox(file, callbacks = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('reqtype', 'fileupload');

  const xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://catbox.moe/user/api.php', true);

  if (callbacks.onProgress) {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        callbacks.onProgress(percent);
      }
    };
  }

  xhr.onload = () => {
    if (xhr.status === 200) {
      const directUrl = xhr.responseText.trim();
      if (callbacks.onSuccess) callbacks.onSuccess(directUrl);
    } else {
      if (callbacks.onError) callbacks.onError(xhr.status);
    }
  };

  xhr.onerror = () => {
    if (callbacks.onError) callbacks.onError('network_error');
  };

  xhr.send(formData);
}
