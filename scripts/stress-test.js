/**
 * ==============================================================================
 * DUALSTREAM - STRESS TEST & LOAD SIMULATOR BOT SWARM
 * Simulates concurrent live viewers downloading HLS video chunks in real-time.
 * ==============================================================================
 */

const https = require('https');
const http = require('http');

const STREAM_URL = process.argv[2] || 'https://62-238-122-186.sslip.io/live/stream/index.m3u8';
const CONCURRENT_USERS = parseInt(process.argv[3], 10) || 50;
const DURATION_SECONDS = parseInt(process.argv[4], 10) || 30;

console.log('==============================================================================');
console.log('🚀 INICIANDO TEST DE ESTRÉS DE SERVIDOR DE STREAMING (DualStream)');
console.log(`📡 URL Objetivo: ${STREAM_URL}`);
console.log(`👥 Usuarios Concurrentes Simulados: ${CONCURRENT_USERS}`);
console.log(`⏱️  Duración de la Prueba: ${DURATION_SECONDS} segundos`);
console.log('==============================================================================\n');

const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  bytesTransferred: 0,
  latencies: [],
  errors: {}
};

const agent = new https.Agent({ keepAlive: true, maxSockets: 500 });

function fetchUrl(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = https.get(url, { agent, timeout: 5000 }, (res) => {
      let dataLength = 0;
      res.on('data', (chunk) => {
        dataLength += chunk.length;
      });
      res.on('end', () => {
        const latency = Date.now() - startTime;
        stats.totalRequests++;
        stats.bytesTransferred += dataLength;
        stats.latencies.push(latency);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          stats.successfulRequests++;
          resolve({ ok: true, statusCode: res.statusCode, latency, bytes: dataLength });
        } else {
          stats.failedRequests++;
          stats.errors[res.statusCode] = (stats.errors[res.statusCode] || 0) + 1;
          resolve({ ok: false, statusCode: res.statusCode, latency, bytes: dataLength });
        }
      });
    });

    req.on('error', (err) => {
      stats.totalRequests++;
      stats.failedRequests++;
      stats.errors[err.code || 'ERR'] = (stats.errors[err.code || 'ERR'] || 0) + 1;
      resolve({ ok: false, error: err.message, latency: Date.now() - startTime, bytes: 0 });
    });

    req.on('timeout', () => {
      req.destroy();
      stats.totalRequests++;
      stats.failedRequests++;
      stats.errors['TIMEOUT'] = (stats.errors['TIMEOUT'] || 0) + 1;
      resolve({ ok: false, error: 'TIMEOUT', latency: 5000, bytes: 0 });
    });
  });
}

async function simulateViewer(id, stopTime) {
  const baseUrl = STREAM_URL.substring(0, STREAM_URL.lastIndexOf('/') + 1);
  let seenSegments = new Set();

  while (Date.now() < stopTime) {
    try {
      // 1. Fetch playlist
      const playlistRes = await new Promise((resolve) => {
        const req = https.get(STREAM_URL, { agent, timeout: 5000 }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        });
        req.on('error', () => resolve({ statusCode: 500, body: '' }));
      });

      if (playlistRes.statusCode === 200 && playlistRes.body) {
        // Look for child playlist or segments
        const lines = playlistRes.body.split('\n');
        const childPlaylist = lines.find(l => l.trim().endsWith('.m3u8'));
        
        let segmentLines = lines.filter(l => l.trim().endsWith('.ts'));

        if (childPlaylist) {
          const childUrl = baseUrl + childPlaylist.trim();
          const childRes = await new Promise((resolve) => {
            const req = https.get(childUrl, { agent, timeout: 5000 }, (res) => {
              let body = '';
              res.on('data', c => body += c);
              res.on('end', () => resolve({ statusCode: res.statusCode, body }));
            });
            req.on('error', () => resolve({ statusCode: 500, body: '' }));
          });
          if (childRes.statusCode === 200 && childRes.body) {
            segmentLines = childRes.body.split('\n').filter(l => l.trim().endsWith('.ts'));
          }
        }

        // Download latest segments
        const recentSegments = segmentLines.slice(-2);
        for (const seg of recentSegments) {
          const segUrl = baseUrl + seg.trim();
          if (!seenSegments.has(segUrl)) {
            seenSegments.add(segUrl);
            await fetchUrl(segUrl);
          }
        }
      }
    } catch (e) {}

    // Wait 1.8 seconds before next fragment check (realistic HLS polling rate)
    await new Promise(r => setTimeout(r, 1800));
  }
}

async function runStressTest() {
  const stopTime = Date.now() + (DURATION_SECONDS * 1000);
  const viewers = [];

  const intervalLog = setInterval(() => {
    const elapsed = Math.round((DURATION_SECONDS * 1000 - (stopTime - Date.now())) / 1000);
    const mbTotal = (stats.bytesTransferred / (1024 * 1024)).toFixed(1);
    const avgLat = stats.latencies.length > 0 
      ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length) 
      : 0;
    const successPct = stats.totalRequests > 0 
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) 
      : 100;

    process.stdout.write(`\r📊 [${elapsed}s/${DURATION_SECONDS}s] Peticiones: ${stats.totalRequests} | Éxito: ${successPct}% | Descargado: ${mbTotal} MB | Latencia Promedio: ${avgLat}ms`);
  }, 1000);

  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    viewers.push(simulateViewer(i, stopTime));
    // Stagger startup slightly to simulate organic viewer arrivals
    await new Promise(r => setTimeout(r, 20));
  }

  await Promise.all(viewers);
  clearInterval(intervalLog);

  console.log('\n\n==============================================================================');
  console.log('📋 INFORME FINAL DE RENDIMIENTO Y RESISTENCIA');
  console.log('==============================================================================');
  console.log(`👥 Usuarios Simulados:        ${CONCURRENT_USERS}`);
  console.log(`⏱️  Duración:                  ${DURATION_SECONDS}s`);
  console.log(`📦 Peticiones Totales:        ${stats.totalRequests}`);
  console.log(`✅ Peticiones Exitosas (200): ${stats.successfulRequests} (${((stats.successfulRequests / (stats.totalRequests || 1)) * 100).toFixed(2)}%)`);
  console.log(`❌ Peticiones Fallidas:       ${stats.failedRequests}`);
  console.log(`📈 Tráfico Transferido:       ${(stats.bytesTransferred / (1024 * 1024)).toFixed(2)} MB`);
  
  if (stats.latencies.length > 0) {
    const sorted = [...stats.latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const avg = Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length);
    console.log(`⚡ Latencia Promedio:         ${avg} ms`);
    console.log(`⚡ Latencia P50 (Mediana):    ${p50} ms`);
    console.log(`⚡ Latencia P95 (Peor 5%):    ${p95} ms`);
  }

  if (Object.keys(stats.errors).length > 0) {
    console.log(`⚠️  Desglose de Errores:       ${JSON.stringify(stats.errors)}`);
  }

  console.log('==============================================================================');
  if (stats.failedRequests === 0) {
    console.log('🎉 RESULTADO: EL SERVIDOR PASÓ LA PRUEBA CON 100% DE ÉXITO Y CERO CAÍDAS');
  } else if (stats.successfulRequests / stats.totalRequests > 0.95) {
    console.log('👍 RESULTADO: ESTABILIDAD EXCELENTE (>95% de éxito bajo estrés)');
  } else {
    console.log('⚠️  RESULTADO: SE DETECTÓ SATURACIÓN EN EL SERVIDOR');
  }
  console.log('==============================================================================\n');
}

runStressTest();
