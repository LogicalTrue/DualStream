// Vercel Serverless API: /api/sync
// Almacena y sincroniza el estado de la Watch Party en la nube para todos los viewers

let cachedConfig = {
  streamer: 'losfutbolitos',
  videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  camX: 2,
  camY: 3,
  camW: 26,
  updatedAt: Date.now()
};

// Fallback de persistencia en KV Cloud público gratuito (kvdb.io / jsonbin) para persistencia entre cold starts
const KV_URL = 'https://kvdb.io/6qKxR5dY9mKxS3gZ7wFq9K/dualstream_config';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Obtener estado actual
  if (req.method === 'GET') {
    try {
      const kvRes = await fetch(KV_URL, { cache: 'no-store' });
      if (kvRes.ok) {
        const cloudData = await kvRes.json();
        if (cloudData && cloudData.updatedAt && cloudData.updatedAt > cachedConfig.updatedAt) {
          cachedConfig = cloudData;
        }
      }
    } catch (e) {
      // Usar cachedConfig
    }
    return res.status(200).json(cachedConfig);
  }

  // POST: Guardar nuevo estado
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body) {
        cachedConfig = {
          streamer: body.streamer || cachedConfig.streamer,
          videoUrl: body.videoUrl !== undefined ? body.videoUrl : cachedConfig.videoUrl,
          camX: body.camX !== undefined ? body.camX : cachedConfig.camX,
          camY: body.camY !== undefined ? body.camY : cachedConfig.camY,
          camW: body.camW !== undefined ? body.camW : cachedConfig.camW,
          updatedAt: Date.now()
        };

        // Guardar en KV Cloud
        fetch(KV_URL, {
          method: 'POST',
          body: JSON.stringify(cachedConfig),
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => {});

        return res.status(200).json({ success: true, config: cachedConfig });
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
