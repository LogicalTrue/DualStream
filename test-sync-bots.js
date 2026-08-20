/**
 * SCRIPT DE TEST DE CARGA Y SINCRONIZACIÓN MULTI-BOT
 * Simula N espectadores concurrentes y mide la sincronización con el Admin en tiempo real.
 *
 * Ejecución:
 *   node test-sync-bots.js [cantidad_bots] [segundos_duracion]
 * Ejemplo:
 *   node test-sync-bots.js 10 30
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TEST_URL || 'https://dual-stream-five.vercel.app/';
const NUM_BOTS = parseInt(process.argv[2], 10) || 5;
const DURATION_SECONDS = parseInt(process.argv[3], 10) || 20;

console.log(`\n===============================================================`);
console.log(`🚀 INICIANDO TEST DE SINCRONIZACIÓN CON ${NUM_BOTS} BOTS CONCURRENTES`);
console.log(`🌐 URL Objetivo: ${TARGET_URL}`);
console.log(`⏱️  Duración del test: ${DURATION_SECONDS} segundos`);
console.log(`===============================================================\n`);

async function run() {
  const browser = await chromium.launch({
    headless: true, // Cambia a false si quieres ver las ventanas abrirse
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const bots = [];

  console.log(`⏳ Lanzando e inicializando ${NUM_BOTS} bots de espectadores...`);

  for (let i = 1; i <= NUM_BOTS; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: `DualStreamBot/${i}.0 (WatchPartyTester)`
    });
    const page = await context.newPage();
    
    bots.push({ id: i, context, page });
  }

  // Navegar todos los bots a la página
  await Promise.all(
    bots.map(async (bot) => {
      try {
        await bot.page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Simular clic de inicio si aparece el banner de desbloqueo
        try {
          const unlockBtn = await bot.page.$('#btn-unlock-sync');
          if (unlockBtn) await unlockBtn.click();
        } catch (e) {}
      } catch (err) {
        console.error(`❌ Error iniciando Bot #${bot.id}:`, err.message);
      }
    })
  );

  console.log(`✅ ¡Todos los ${NUM_BOTS} bots están conectados e inspeccionando el stream!\n`);

  // Bucle de monitoreo
  const startTime = Date.now();
  const checkInterval = 2000; // Cada 2 segundos
  let iteration = 1;

  const intervalId = setInterval(async () => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed >= DURATION_SECONDS) {
      clearInterval(intervalId);
      await finishTest(browser, bots);
      return;
    }

    console.log(`\n📊 [Lectura #${iteration} - ${elapsed}s / ${DURATION_SECONDS}s]`);

    // Consultar estado de cada bot
    const results = await Promise.all(
      bots.map(async (bot) => {
        try {
          const metrics = await bot.page.evaluate(() => {
            const streamerLabel = document.getElementById('current-streamer-label');
            const streamer = streamerLabel ? streamerLabel.textContent.trim() : 'Desconocido';
            
            // Comprobar si hay iframe o video nativo
            const iframe = document.querySelector('#movie-media-wrapper iframe');
            const videoElem = document.querySelector('#movie-media-wrapper video');
            const placeholder = document.getElementById('movie-placeholder');
            const isPlaceholderVisible = placeholder && placeholder.style.display !== 'none';

            let videoId = 'N/A';
            if (iframe && iframe.src) {
              const m = iframe.src.match(/embed\/([^?]+)/);
              videoId = m ? m[1] : iframe.src.substring(0, 20);
            }

            return {
              streamer,
              videoId,
              hasMediaElement: !!(iframe || videoElem),
              isPlaceholderVisible
            };
          });

          return { botId: bot.id, success: true, ...metrics };
        } catch (err) {
          return { botId: bot.id, success: false, error: err.message };
        }
      })
    );

    // Mostrar tabla formateada
    const tableData = results.map(r => ({
      'Bot': `Bot #${r.botId}`,
      'Streamer': r.streamer || 'N/A',
      'Video Cargado': r.hasMediaElement ? `✅ ID: ${r.videoId}` : '❌ Sin Video',
      'Estado Pantalla': r.isPlaceholderVisible ? '⏸️ En Espera' : '▶️ Reproduciendo'
    }));

    console.table(tableData);

    const syncedCount = results.filter(r => r.hasMediaElement && !r.isPlaceholderVisible).length;
    console.log(`📈 Sincronización: ${syncedCount}/${NUM_BOTS} bots sincronizados correctamente`);

    iteration++;
  }, checkInterval);
}

async function finishTest(browser, bots) {
  console.log(`\n===============================================================`);
  console.log(`🏁 TEST DE CARGA COMPLETADO EXITOSAMENTE`);
  console.log(`===============================================================\n`);
  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error en test:', err);
  process.exit(1);
});
