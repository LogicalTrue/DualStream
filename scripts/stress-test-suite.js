/**
 * SUITE DE PRUEBA DE ESTRÉS ESCALONADA HLS (1K -> 3K -> 5K -> 10K VIEWERS)
 * Simula audiencia masiva real descargando fragmentos de video en vivo desde BunnyCDN.
 */

const https = require('https');

// Pool de conexiones de alto rendimiento optimizado
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 256,
  timeout: 10000
});

const STREAM_URL = process.env.TEST_STREAM_URL || 'https://stream-blackozu.b-cdn.net/app/stream/llhls.m3u8';

// Configuración de etapas escalonadas
const STAGES = [
  { name: 'Etapa 1 (Calentamiento)', viewers: 500, durationSec: 20 },
  { name: 'Etapa 2 (Carga Media)', viewers: 1500, durationSec: 20 },
  { name: 'Etapa 3 (Carga Alta)', viewers: 3000, durationSec: 25 },
  { name: 'Etapa 4 (Pico Masivo 5k)', viewers: 5000, durationSec: 30 }
];

let globalStats = {
  totalRequests: 0,
  hits: 0,
  misses: 0,
  errors: 0,
  bytesDownloaded: 0,
  latencies: []
};

function fetchWithAgent(url) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const options = {
      agent: keepAliveAgent,
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-DualStream-Benchmark': 'Stress-Test-Authorized'
      }
    };

    const req = https.get(url, options, (res) => {
      let data = [];
      let size = 0;
      res.on('data', chunk => {
        data.push(chunk);
        size += chunk.length;
      });
      res.on('end', () => {
        const dt = Date.now() - t0;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(data).toString('utf8'),
          size,
          duration: dt
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function simulateHlsViewer(viewerId, stopSignal) {
  const downloadedChunks = new Set();
  let masterChunklistUrl = null;

  // Staggered startup
  await new Promise(r => setTimeout(r, Math.random() * 2000));

  while (!stopSignal.stopped) {
    try {
      if (!masterChunklistUrl) {
        const mRes = await fetchWithAgent(STREAM_URL);
        globalStats.totalRequests++;
        globalStats.bytesDownloaded += mRes.size;
        globalStats.latencies.push(mRes.duration);

        if (mRes.status !== 200) {
          globalStats.errors++;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        const match = mRes.body.match(/\/app\/stream\/chunklist_0_video_[^\s]+\.m3u8/);
        if (match) {
          masterChunklistUrl = 'https://stream-blackozu.b-cdn.net' + match[0];
        } else {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }

      const cRes = await fetchWithAgent(masterChunklistUrl);
      globalStats.totalRequests++;
      globalStats.bytesDownloaded += cRes.size;
      globalStats.latencies.push(cRes.duration);

      if (cRes.status === 200) {
        const segMatches = [...cRes.body.matchAll(/seg_[^\s"]+\.m4s/g)].map(m => m[0]);
        if (segMatches.length > 0) {
          const latestSeg = segMatches[segMatches.length - 1];
          if (!downloadedChunks.has(latestSeg)) {
            downloadedChunks.add(latestSeg);
            const segUrl = 'https://stream-blackozu.b-cdn.net/app/stream/' + latestSeg;
            const sRes = await fetchWithAgent(segUrl);
            globalStats.totalRequests++;
            globalStats.bytesDownloaded += sRes.size;
            globalStats.latencies.push(sRes.duration);

            const cacheHeader = (sRes.headers['cdn-cache'] || sRes.headers['x-cache'] || '').toUpperCase();
            if (cacheHeader.includes('HIT')) {
              globalStats.hits++;
            } else {
              globalStats.misses++;
            }
          }
        }
      } else {
        globalStats.errors++;
      }

      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    } catch (e) {
      globalStats.errors++;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function runStage(stage) {
  console.log(`\n================================================================`);
  console.log(`▶️ INICIANDO: ${stage.name}`);
  console.log(`👥 Viewers Concurrentes Simulados: ${stage.viewers}`);
  console.log(`⏱️ Duración de la etapa: ${stage.durationSec}s`);
  console.log(`================================================================\n`);

  const stopSignal = { stopped: false };
  const workers = [];

  // Spawn de espectadores con ráfaga escalonada suave
  for (let i = 1; i <= stage.viewers; i++) {
    workers.push(simulateHlsViewer(i, stopSignal));
    if (i % 200 === 0) {
      await new Promise(r => setTimeout(r, 100)); // Staggering
    }
  }

  // Monitor en vivo durante la etapa
  const stageStart = Date.now();
  const stageDurationMs = stage.durationSec * 1000;

  while (Date.now() - stageStart < stageDurationMs) {
    await new Promise(r => setTimeout(r, 3000));
    const elapsed = Math.round((Date.now() - stageStart) / 1000);
    const hitRate = (globalStats.hits + globalStats.misses) > 0 
      ? ((globalStats.hits / (globalStats.hits + globalStats.misses)) * 100).toFixed(1) 
      : '0.0';
    const mbDownloaded = (globalStats.bytesDownloaded / (1024 * 1024)).toFixed(1);
    const avgLatency = globalStats.latencies.length > 0 
      ? Math.round(globalStats.latencies.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, globalStats.latencies.length)) 
      : 0;

    console.log(`⏱️ [${elapsed}s/${stage.durationSec}s] Viewers: ${stage.viewers} | Req: ${globalStats.totalRequests} | Cache HIT: ${hitRate}% | Latencia: ${avgLatency}ms | Tráfico: ${mbDownloaded} MB | Errores: ${globalStats.errors}`);
  }

  // Detener etapa
  stopSignal.stopped = true;
  await Promise.allSettled(workers);
}

async function startStressTestSuite() {
  console.log(`\n🚀 INICIANDO SUITE DE PRUEBA DE ESTRÉS ESCALONADA HLS`);
  console.log(`🌐 Endpoint Objetivo: ${STREAM_URL}`);
  console.log(`🎯 Objetivo: Verificar que BunnyCDN absorba el tráfico sin saturar el origen.\n`);

  const suiteStart = Date.now();

  for (const stage of STAGES) {
    await runStage(stage);
  }

  const totalTimeSec = Math.round((Date.now() - suiteStart) / 1000);
  const finalHitRate = (globalStats.hits + globalStats.misses) > 0 
    ? ((globalStats.hits / (globalStats.hits + globalStats.misses)) * 100).toFixed(1) 
    : '0.0';
  const totalGB = (globalStats.bytesDownloaded / (1024 * 1024 * 1024)).toFixed(2);
  const totalAvgLatency = globalStats.latencies.length > 0 
    ? Math.round(globalStats.latencies.reduce((a, b) => a + b, 0) / globalStats.latencies.length) 
    : 0;

  console.log(`\n================================================================`);
  console.log(`📊 REPORTE FINAL DE LA PRUEBA DE ESTRÉS`);
  console.log(`================================================================`);
  console.log(`⏱️ Duración Total: ${totalTimeSec} segundos`);
  console.log(`📩 Total Peticiones Enviadas: ${globalStats.totalRequests}`);
  console.log(`🎯 BunnyCDN Cache Hit Rate: ${finalHitRate}%`);
  console.log(`⚡ Latencia Promedio de Entrega: ${totalAvgLatency} ms`);
  console.log(`📦 Volumen Total Descargado: ${totalGB} GB`);
  console.log(`❌ Errores Totales: ${globalStats.errors} (${((globalStats.errors / Math.max(1, globalStats.totalRequests)) * 100).toFixed(2)}%)`);
  console.log(`================================================================\n`);
}

startStressTestSuite();
