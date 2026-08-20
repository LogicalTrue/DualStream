/**
 * API de Subida Rápida de Videos MP4
 * Sube el archivo y devuelve una URL pública con soporte para streaming y CDN
 */

const formidable = require('formidable');
const fs = require('fs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-admin-session');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Comprobar autorización del admin si está configurada
  const EXPECTED_ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (EXPECTED_ADMIN_SECRET) {
    const authHeader = req.headers['authorization'] || '';
    const customHeader = req.headers['x-admin-secret'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || customHeader;
    if (!token || token !== EXPECTED_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado: clave de admin inválida' });
    }
  }

  try {
    // Si Vercel Blob Storage está configurado
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = require('@vercel/blob');
      const filename = req.headers['x-filename'] || `video-${Date.now()}.mp4`;
      const blob = await put(filename, req, { access: 'public' });
      return res.status(200).json({ url: blob.url });
    }

    // Fallback de alta velocidad usando Catbox / File Service para streaming directo de MP4
    const FormData = require('form-data');
    const form = new formidable.IncomingForm({ maxFileSize: 500 * 1024 * 1024 }); // Hasta 500MB

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(400).json({ error: 'Error procesando el archivo: ' + err.message });
      }

      const fileObj = files.file || files.video;
      const uploadedFile = Array.isArray(fileObj) ? fileObj[0] : fileObj;

      if (!uploadedFile || !uploadedFile.filepath) {
        return res.status(400).json({ error: 'No se recibió ningún archivo de video válido' });
      }

      try {
        const fileStream = fs.createReadStream(uploadedFile.filepath);
        const externalForm = new FormData();
        externalForm.append('reqtype', 'fileupload');
        externalForm.append('fileToUpload', fileStream, uploadedFile.originalFilename || 'video.mp4');

        const uploadRes = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: externalForm,
          headers: externalForm.getHeaders()
        });

        if (uploadRes.ok) {
          const directUrl = (await uploadRes.text()).trim();
          return res.status(200).json({ url: directUrl, filename: uploadedFile.originalFilename });
        } else {
          return res.status(500).json({ error: 'Error subiendo al servidor de archivos' });
        }
      } catch (uploadErr) {
        console.error('Error al subir video:', uploadErr);
        return res.status(500).json({ error: 'Error interno en la subida: ' + uploadErr.message });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
