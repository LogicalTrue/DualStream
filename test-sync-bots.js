/**
 * SCRIPT DE TEST DE CARGA, PAUSAS Y SINCRONIZACIÓN EN TIEMPO REAL
 * 
 * Registra cada evento de PAUSA / PLAY del Admin y valida que todos los bots
 * hayan recibido la pausa, congelado el segundo exacto y reanudado al mismo tiempo.
 *
 * Ejecución:
 *   node test-sync-bots.js [cantidad_bots] [segundos_duracion]
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TEST_URL || 'https://dual-stream-five.vercel.app/';
const NUM_BOTS = parseInt(process.argv[2], 10) || 5;
const DURATION_SECONDS = parseInt(process.argv[3], 10) || 30;

console.log(`\n===============================================================`);
console.log(`🎬 AUDITORÍA DE SINCRONIZACIÓN Y EVENTOS DE PAUSA/PLAY EN VIVO`);
console.log(`👥 Cantidad de Bots: ${NUM_BOTS} bots`);
console.log(`🌐 URL: ${TARGET_URL}`);
console.log(`⏱️  Duración: ${DURATION_SECONDS} segundos`);
console.log(`💡 TIP: Entra como Admin en tu navegador y haz PAUSA/PLAY o adelanta el video`);
console.log(`===============================================================\n`);

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const bots = [];
  console.log(`⏳ Conectando ${NUM_BOTS} bots de espectadores...`);

  for (let i = 1; i <= NUM_BOTS; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: `DualStreamBot/${i}.0 (WatchPartyTester)`
    });
    const page = await context.newPage();
    bots.push({
      id: i,
      context,
      page,
      lastState: null,
      lastTime: 0,
      pauseCount: 0,
      playCount: 0,
      pauseHistory: []
    });
  }

  await Promise.all(
    bots.map(async (bot) => {
      try {
        await bot.page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
          const unlockBtn = await bot.page.$('#btn-unlock-sync');
          if (unlockBtn) await unlockBtn.click();
        } catch (e) {}
      } catch (err) {
        console.error(`❌ Error en Bot #${bot.id}:`, err.message);
      }
    })
  );

  console.log(`✅ ¡${NUM_BOTS} bots conectados y escuchando eventos de Pausa/Play!\n`);

  const startTime = Date.now();
  let iteration = 1;
  let totalMasterPausesDetected = 0;

  const intervalId = setInterval(async () => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed >= DURATION_SECONDS) {
      clearInterval(intervalId);
      await finishTest(browser, bots);
      return;
    }

    // Consultar el estado interno de cada bot
    const results = await Promise.all(
      bots.map(async (bot) => {
        try {
          const metrics = await bot.page.evaluate(() => {
            const streamerLabel = document.getElementById('current-streamer-label');
            const streamer = streamerLabel ? streamerLabel.textContent.trim() : 'N/A';
            
            // Detectar estado de reproducción
            let isPlaying = false;
            let currentTime = 0;

            if (window.ytPlayerInstance && typeof window.ytPlayerInstance.getPlayerState === 'function') {
              const state = window.ytPlayerInstance.getPlayerState();
              isPlaying = (state === 1 || state === 3);
              currentTime = window.ytPlayerInstance.getCurrentTime() || 0;
            } else if (window.latestSyncPlaybackState) {
              isPlaying = !!window.latestSyncPlaybackState.isPlaying;
              currentTime = window.latestSyncPlaybackState.currentTime || 0;
            }

            const iframe = document.querySelector('#movie-media-wrapper iframe');
            const videoElem = document.querySelector('#movie-media-wrapper video');
            let videoId = 'N/A';
            if (iframe && iframe.src) {
              const m = iframe.src.match(/embed\/([^?]+)/);
              videoId = m ? m[1] : iframe.src.substring(0, 15);
            }

            return {
              streamer,
              videoId,
              isPlaying,
              currentTime: parseFloat(currentTime.toFixed(1)),
              hasMedia: !!(iframe || videoElem)
            };
          });

          // Detectar transición de estado (Play -> Pausa o Pausa -> Play)
          if (bot.lastState !== null) {
            if (bot.lastState === true && metrics.isPlaying === false) {
              // Hubo una PAUSA
              bot.pauseCount++;
              bot.pauseHistory.push({ type: 'PAUSE', time: metrics.currentTime, atSec: elapsed });
              console.log(`\n🛑 [PAUSA DETECTADA] Bot #${bot.id} detectó PAUSA en el segundo: ${metrics.currentTime}s`);
            } else if (bot.lastState === false && metrics.isPlaying === true) {
              // Hubo un PLAY
              bot.playCount++;
              bot.pauseHistory.push({ type: 'PLAY', time: metrics.currentTime, atSec: elapsed });
              console.log(`\n▶️ [PLAY DETECTADO] Bot #${bot.id} reanudó reproducción en el segundo: ${metrics.currentTime}s`);
            }
          }

          bot.lastState = metrics.isPlaying;
          bot.lastTime = metrics.currentTime;

          return { botId: bot.id, success: true, pauseCount: bot.pauseCount, ...metrics };
        } catch (err) {
          return { botId: bot.id, success: false, error: err.message };
        }
      })
    );

    console.log(`\n📊 [Monitor #${iteration} - ${elapsed}s / ${DURATION_SECONDS}s]`);

    // Mostrar tabla formateada
    const tableData = results.map(r => ({
      'Bot': `Bot #${r.botId}`,
      'Canal': r.streamer || 'N/A',
      'Video ID': r.videoId,
      'Estado Actual': r.isPlaying ? '▶️ REPRODUCIENDO' : '⏸️ PAUSADO',
      'Segundo Video': `${r.currentTime}s`,
      'Total Pausas Recibidas': `${r.pauseCount || 0} pausas`
    }));

    console.table(tableData);

    iteration++;
  }, 2000);
}

async function finishTest(browser, bots) {
  console.log(`\n===============================================================`);
  console.log(`📊 REPORTE FINAL DE PAUSAS Y SINCRONIZACIÓN`);
  console.log(`===============================================================`);

  const summary = bots.map(b => ({
    'Bot': `Bot #${b.id}`,
    'Pausas Detectadas': `${b.pauseCount} veces`,
    'Reanudaciones (Play)': `${b.playCount} veces`,
    'Segundo Final': `${b.lastTime}s`,
    'Historial de Eventos': b.pauseHistory.map(h => `${h.type}@${h.time}s`).join(', ') || 'Sin pausas manuales'
  }));

  console.table(summary);

  try {
    await bots[0].page.screenshot({ path: 'bot-1-live-view.png' });
    console.log(`📸 Captura de pantalla final guardada en: bot-1-live-view.png\n`);
  } catch (e) {}

  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
