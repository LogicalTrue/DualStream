/**
 * DualStream Cloud Sync API
 * Persistencia en tiempo real mediante Upstash Redis / Vercel KV REST API
 */

let memoryStateStore = {
  streamer: 'blackozutr',
  videoUrl: 'https://www.youtube.com/watch?v=A8qw5r6aDYo',
  camX: 2,
  camY: 3,
  camW: 26,
  currentTime: 0,
  isPlaying: false,
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- POST: Guardar nuevo estado del streamer ---
  if (req.method === 'POST') {
    try {
      const incomingData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (incomingData) {
        // Leer estado actual existente
        const currentState = (await getFromRedis()) || memoryStateStore;
        const updatedState = {
          ...currentState,
          ...incomingData,
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

  // --- GET: Obtener el estado actual más reciente ---
  const cloudState = await getFromRedis();
  if (cloudState) {
    return res.status(200).json(cloudState);
  }

  return res.status(200).json(memoryStateStore);
};
