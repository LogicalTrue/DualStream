const https = require('https');

function testFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = [];
      res.on('data', c => data.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          cache: res.headers['cdn-cache'] || res.headers['x-cache'] || 'NONE',
          server: res.headers['server'],
          size: Buffer.concat(data).length
        });
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- TEST FORENSE DE CACHÉ DE FRAGMENTOS REALES ---');
  const masterRes = await fetch('https://stream-blackozu.b-cdn.net/app/stream/llhls.m3u8');
  if (!masterRes.ok) {
    console.log('Stream offline o error:', masterRes.status);
    return;
  }
  const master = await masterRes.text();
  const chunklistMatch = master.match(/\/app\/stream\/chunklist_0_video_[^\s]+\.m3u8/);
  if (!chunklistMatch) {
    console.log('No se encontro chunklist');
    return;
  }
  const chunklistUrl = 'https://stream-blackozu.b-cdn.net' + chunklistMatch[0];
  const chunklist = await (await fetch(chunklistUrl)).text();

  const segMatches = [...chunklist.matchAll(/seg_[^\s"]+\.m4s/g)].map(m => m[0]);
  console.log('Ultimos segmentos encontrados en la playlist:', segMatches.slice(-3));

  if (segMatches.length > 0) {
    const latestSeg = segMatches[segMatches.length - 1];
    const segUrl = 'https://stream-blackozu.b-cdn.net/app/stream/' + latestSeg;
    
    console.log('\nDescargando segmento:', latestSeg);
    const r1 = await testFetch(segUrl);
    console.log(`Espectador 1 (Petición Inicial): Status ${r1.status} | Cache: ${r1.cache} | Bytes: ${r1.size} | Servidor: ${r1.server}`);
    
    // Simular que 3 espectadores mas piden exactamente el mismo fragmento
    const r2 = await testFetch(segUrl);
    console.log(`Espectador 2 (Cache):           Status ${r2.status} | Cache: ${r2.cache} | Bytes: ${r2.size} | Servidor: ${r2.server}`);

    const r3 = await testFetch(segUrl);
    console.log(`Espectador 3 (Cache):           Status ${r3.status} | Cache: ${r3.cache} | Bytes: ${r3.size} | Servidor: ${r3.server}`);
  }
}

run();
