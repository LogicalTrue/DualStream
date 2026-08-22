#!/bin/bash
# ==============================================================================
# SCRIPT DE INSTALACIÓN AUTOMÁTICA DE SERVIDOR DE STREAMING (DualStream)
# Compatible con cualquier servidor Ubuntu/Debian (Hetzner, DigitalOcean, Linode, AWS, etc.)
# ==============================================================================

echo "🚀 Iniciando instalación de servidor de streaming DualStream..."

# 1. Actualizar sistema e instalar Caddy
apt update && apt install -y caddy curl tar ufw

# 2. Descargar e instalar MediaMTX
cd /root
wget https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_linux_amd64.tar.gz
tar -xzf mediamtx_v1.9.3_linux_amd64.tar.gz
chmod +x /root/mediamtx

# 3. Crear configuración optimizada de MediaMTX (HLS para streaming OBS fluido)
cat << 'EOF' > /root/mediamtx.yml
hlsVariant: mpegts
hlsSegmentCount: 7
hlsSegmentDuration: 2s
hlsAllowOrigin: '*'
paths:
  live/stream:
  all_others:
EOF

# 4. Obtener IP pública del servidor y configurar Caddy con SSL automático (sslip.io)
SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
SSL_DOMAIN="${SERVER_IP//./-}.sslip.io"

cat << EOF > /etc/caddy/Caddyfile
$SSL_DOMAIN {
    reverse_proxy localhost:8888
}
EOF

# 5. Abrir puertos del Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 1935/tcp
ufw allow 8888/tcp
ufw --force enable

# 6. Crear servicio Systemd para que arranque solo siempre
cat << 'EOF' > /etc/systemd/system/mediamtx.service
[Unit]
Description=MediaMTX Streaming Server
After=network.target

[Service]
Type=simple
ExecStart=/root/mediamtx /root/mediamtx.yml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mediamtx
systemctl restart mediamtx
systemctl restart caddy

echo "=============================================================================="
echo "✅ ¡SERVIDOR DE STREAMING LISTO EN MENOS DE 1 MINUTO!"
echo "=============================================================================="
echo "📡 DATOS PARA OBS STUDIO:"
echo "   - Servidor: rtmp://$SERVER_IP/live"
echo "   - Clave de transmisión: stream"
echo ""
echo "🎬 URL PARA TU PANEL DE DUALSTREAM:"
echo "   - https://$SSL_DOMAIN/live/stream/index.m3u8"
echo "=============================================================================="
