/**
 * ==========================================================================
 * LOCAL STREAMING SERVER FOR OBS TESTING (RTMP -> HLS)
 * Recibe la señal de OBS por RTMP y la convierte en .m3u8 (HLS) en vivo
 * ==========================================================================
 */

const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');

const mediaRoot = path.join(__dirname, '../.media');
if (!fs.existsSync(mediaRoot)) {
  fs.mkdirSync(mediaRoot, { recursive: true });
}

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: mediaRoot,
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: false
      }
    ]
  }
};

const nms = new NodeMediaServer(config);

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[OBS Conectado] Transmisión recibida en:', StreamPath);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[OBS Desconectado] Transmisión finalizada en:', StreamPath);
});

nms.run();

console.log('\n======================================================');
console.log('🚀 SERVIDOR LOCAL DE OBS INICIADO CON ÉXITO');
console.log('======================================================');
console.log('1. En OBS ve a: Ajustes -> Emisión');
console.log('   - Servicio: Personalizado');
console.log('   - Servidor: rtmp://127.0.0.1/live');
console.log('   - Clave de transmisión: stream');
console.log('\n2. En la web DualStream usa esta URL en el Admin:');
console.log('   👉 http://localhost:8000/live/stream/index.m3u8');
console.log('======================================================\n');
