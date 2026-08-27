const DEFAULT_STREAM_URL = 'wss://stream.blackozulive.com/app/stream';

let memoryStateStore = {
  streamer: 'BlackozuTR',
  videoUrl: DEFAULT_STREAM_URL,
  camX: 2,
  camY: 3,
  camW: 26,
  isOnline: true,
  isViewerConnected: true,
  currentTime: 0,
  isPlaying: true,
  updatedAt: Date.now()
};

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
  } catch (err) {}
  return null;
}

async function saveToRedis(state) {
  if (!KV_URL || !KV_TOKEN) {
    return false;
  }
  try {
    const cleanUrl = KV_URL.replace(/\/$/, '');
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
    return false;
  }
}

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
      signal: AbortSignal.timeout(1200)
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const customHeader = req.headers['x-admin-secret'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || customHeader;

    if (!EXPECTED_ADMIN_SECRET || !token || token !== EXPECTED_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    try {
      const incomingData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!incomingData) {
        return res.status(400).json({ error: 'Payload vacío' });
      }

      const { adminSecret, ...cleanDataToSave } = incomingData;
      const currentState = (await getFromRedis()) || memoryStateStore;
      const updatedState = {
        ...currentState,
        ...cleanDataToSave,
        updatedAt: Date.now()
      };

      memoryStateStore = updatedState;
      await saveToRedis(updatedState);

      return res.status(200).json(updatedState);
    } catch (e) {
      return res.status(400).json({ error: 'JSON inválido' });
    }
  }

  let currentState = (await getFromRedis()) || memoryStateStore;
  const requestedUrl = req.query && req.query.url ? decodeURIComponent(req.query.url) : null;
  const targetVideoUrl = requestedUrl || DEFAULT_STREAM_URL;

  let isStreamOnline = false;
  if (targetVideoUrl.includes('.m3u8')) {
    isStreamOnline = await probeStreamOnline(targetVideoUrl);
  }

  const responseState = {
    streamer: currentState.streamer || 'BlackozuTR',
    videoUrl: targetVideoUrl,
    offlineImg: currentState.offlineImg || '',
    onlineImg: currentState.onlineImg || '',
    isOnline: isStreamOnline,
    isLive: isStreamOnline,
    updatedAt: currentState.updatedAt || Date.now()
  };

  return res.status(200).json(responseState);
};
