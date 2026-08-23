/**
 * ==========================================================================
 * CONFIGURACIÓN CENTRAL DEL STREAMER Y TRANSMISIÓN (CLIENT CONFIG)
 * Edita este único archivo para cambiar el canal, el stream de OBS y los banners.
 * ==========================================================================
 */

export const STREAM_CONFIG = {
  // Canal / Usuario de Kick (para el chat en vivo con 7TV y views automáticos)
  kickChannel: 'BlackozuTR',

  // URL del Video o Transmisión en Vivo (.m3u8 de OBS, YouTube o MP4)
  videoUrl: 'https://62-238-122-186.sslip.io/live/stream/index.m3u8',

  // Pantallas de espera:
  // Imagen de Portada cuando el stream está APAGADO / OFFLINE (opcional)
  offlinePoster: 'https://i.imgur.com/AhT5Obw.jpeg',

  // Imagen de Portada cuando el stream está PRENDIDO / ONLINE (opcional)
  onlinePoster: '',

  // Redes Sociales oficiales:
  socials: {
    kickSubscribe: 'https://kick.com/BlackozuTR/subscribe',
    youtube: 'https://www.youtube.com/@blackozu',
    instagram: 'https://www.instagram.com/blackozuterror/'
  }
};
