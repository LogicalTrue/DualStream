/**
 * DualStream Cloud Sync API
 * Persistencia en tiempo real mediante Upstash Redis / Vercel KV REST API
 */

let memoryStateStore = {
  streamer: 'BlackozuTR',
  videoUrl: 'https://62-238-122-186.sslip.io/live/stream/index.m3u8',
  camX: 2,
  camY: 3,
  camW: 26,
  isOnline: true,
  isViewerConnected: true,
  currentTime: 0,
  isPlaying: true,
  updatedAt: Date.now()
};

// Resuelve cualquier combinación de nombres de variables inyectadas por Vercel / Upstash
const KV_URL = 
  process.env.KV_REST_API_URL || 
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.STORAGE_REST_API_URL ||
  process.env.STORAGE_KV_REST_API_URL ||
  process.env.STORAGE_UPSTASH_REDIS_REST_URL ||
  process.env.STORAGE_URL;

const KV_TOKEN = 
  process.env.KV_REST_API_TOKEN || 
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.STORAGE_REST_API_TOKEN ||
  process.env.STORAGE_KV_REST_API_TOKEN ||
  process.env.STORAGE_UPSTASH_REDIS_REST_TOKEN ||
  process.env.STORAGE_TOKEN;

const REDIS_KEY = 'dualstream_latest_state';

async function getFromRedis() {
  if (!KV_URL || !KV_TOKEN) {
    return null;
  }
  try {
    const cleanUrl = KV_URL.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.result !== null && data.result !== undefined) {
        return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      }
    }
  } catch (err) {
    console.error('Error leyendo de Upstash Redis:', err);
  }
  return null;
}

async function saveToRedis(state) {
  if (!KV_URL || !KV_TOKEN) {
    return false;
  }
  try {
    const cleanUrl = KV_URL.replace(/\/$/, '');
    // Upstash REST API acepta POST con array de comandos: ["SET", key, value]
    const res = await fetch(`${cleanUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["SET", REDIS_KEY, JSON.stringify(state)])
    });
    return res.ok;
  } catch (err) {
    console.error('Error guardando en Upstash Redis:', err);
    return false;
  }
}

const REDIS_SESSION_KEY = 'dualstream_active_admin_session';
let memoryActiveSessionToken = null;

async function getActiveSessionFromRedis() {
  if (!KV_URL || !KV_TOKEN) return memoryActiveSessionToken;
  try {
    const cleanUrl = KV_URL.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}/get/${REDIS_SESSION_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.result !== null && data.result !== undefined) {
        return typeof data.result === 'string' ? data.result : String(data.result);
      }
    }
  } catch (err) {
    console.error('Error leyendo sesión de Upstash Redis:', err);
  }
  return memoryActiveSessionToken;
}

async function setActiveSessionInRedis(token) {
  memoryActiveSessionToken = token;
  if (!KV_URL || !KV_TOKEN) return true;
  try {
    const cleanUrl = KV_URL.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["SET", REDIS_SESSION_KEY, token])
    });
    return res.ok;
  } catch (err) {
    console.error('Error guardando sesión en Upstash Redis:', err);
    return false;
  }
}

// Cache del probe de origen: evita que cada viewer (poll cada 800ms desde el
// cliente) dispare su propio fetch al servidor de media. Se comparte entre
// requests mientras la instancia serverless siga "caliente".
let originProbeCache = { url: null, isOnline: false, ts: 0 };
const ORIGIN_PROBE_TTL_MS = 1500;

async function probeStreamOnline(targetVideoUrl) {
  const now = Date.now();
  if (originProbeCache.url === targetVideoUrl && (now - originProbeCache.ts) < ORIGIN_PROBE_TTL_MS) {
    return originProbeCache.isOnline;
  }
  let isOnline = false;
  try {
    const probeRes = await fetch(targetVideoUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(800)
    });
    isOnline = probeRes.ok;
  } catch (e) {
    isOnline = false;
  }
  originProbeCache = { url: targetVideoUrl, isOnline, ts: now };
  return isOnline;
}

const EXPECTED_ADMIN_SECRET = process.env.ADMIN_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-admin-session');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- POST: Login, Verificación o Guardado ---
  if (req.method === 'POST') {
    try {
      const incomingData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const authHeader = req.headers['authorization'] || '';
      const customHeader = req.headers['x-admin-secret'] || '';
      const sessionHeader = req.headers['x-admin-session'] || (incomingData && incomingData.sessionToken);
      const token = authHeader.replace(/^Bearer\s+/i, '').trim() || customHeader || (incomingData && incomingData.adminSecret);

      // Validación de autenticación si ADMIN_SECRET está configurado en Vercel
      if (EXPECTED_ADMIN_SECRET) {
        if (!token || token !== EXPECTED_ADMIN_SECRET) {
          return res.status(401).json({ error: 'No autorizado: ADMIN_SECRET inválido o ausente' });
        }
      }

      // 1. Caso: Login / Inicio de Sesión nuevo -> Genera y registra nueva sesión única y marca online
      if (incomingData && incomingData.type === 'VERIFY_AUTH') {
        const newSessionToken = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        await setActiveSessionInRedis(newSessionToken);

        const currentState = (await getFromRedis()) || memoryStateStore;
        const updatedState = {
          ...currentState,
          isOnline: true,
          updatedAt: Date.now()
        };
        memoryStateStore = updatedState;
        await saveToRedis(updatedState);

        return res.status(200).json({ 
          ok: true, 
          message: 'Autenticación exitosa',
          sessionToken: newSessionToken,
          state: updatedState
        });
      }

      // 1.5. Caso: Logout explícito del Admin -> Pone el stream en OFFLINE
      if (incomingData && incomingData.type === 'LOGOUT') {
        await setActiveSessionInRedis('');
        const currentState = (await getFromRedis()) || memoryStateStore;
        const updatedState = {
          ...currentState,
          isOnline: false,
          isPlaying: false,
          updatedAt: Date.now()
        };
        memoryStateStore = updatedState;
        await saveToRedis(updatedState);
        return res.status(200).json({ ok: true, isOnline: false });
      }

      // 2. Caso: Verificación de sesión activa (Heartbeat / polling)
      if (incomingData && incomingData.type === 'CHECK_SESSION') {
        const currentActive = await getActiveSessionFromRedis();
        if (currentActive && sessionHeader && currentActive !== sessionHeader) {
          return res.status(403).json({ 
            error: 'SESSION_TERMINATED', 
            message: 'Se ha iniciado sesión desde otro dispositivo' 
          });
        }
        return res.status(200).json({ ok: true, active: true });
      }

      // 3. Caso: Guardar nuevo estado del streamer
      if (incomingData) {
        // Verificar que la sesión que intenta guardar siga siendo la sesión activa
        const currentActive = await getActiveSessionFromRedis();
        if (currentActive && sessionHeader && currentActive !== sessionHeader) {
          return res.status(403).json({ 
            error: 'SESSION_TERMINATED', 
            message: 'Tu sesión ha expirado porque se inició sesión desde otro dispositivo' 
          });
        }

        // Limpiar campos internos antes de persistir
        const { adminSecret, sessionToken, ...cleanDataToSave } = incomingData;

        // Leer estado actual existente
        const currentState = (await getFromRedis()) || memoryStateStore;
        const updatedState = {
          ...currentState,
          ...cleanDataToSave,
          updatedAt: Date.now()
        };

        memoryStateStore = updatedState;
        await saveToRedis(updatedState);

        return res.status(200).json(updatedState);
      }
      return res.status(400).json({ error: 'No data provided' });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  // --- GET: Obtener el estado actual más reciente con verificación server-side ---
  let currentState = (await getFromRedis()) || memoryStateStore;

  const targetVideoUrl = currentState.videoUrl || 'https://62-238-122-186.sslip.io/live/stream/index.m3u8';
  let isStreamOnline = false;

  if (targetVideoUrl.includes('.m3u8')) {
    isStreamOnline = await probeStreamOnline(targetVideoUrl);
  }

  const responseState = {
    ...currentState,
    isOnline: isStreamOnline,
    isLive: isStreamOnline
  };

  return res.status(200).json(responseState);
};
