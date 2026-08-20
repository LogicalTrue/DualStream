# 🎬 Kick Dual Viewer — Watch Party Sincronizado

**Kick Dual Viewer** es una aplicación web responsiva de una sola página (SPA) moderna, ligera y de alto rendimiento diseñada para ver películas, series o videos externos simultáneamente con la reacción en vivo de un streamer en **Kick** y su chat oficial incrustado.

---

## 🌟 Características Principales

- 🖥️ **Distribución Watch Party (Desktop 100vh)**:
  - **Columna Izquierda (Video ~77%)**:
    - **Sección Superior (65% alto)**: Reproductor principal para películas/series con soporte para iframes externos (Streamwish, Doodstream, YouTube, Filemoon, etc.) y etiqueta `<video>` nativa (`.mp4`, `.webm`, `.ogg`).
    - **Sección Inferior (35% alto)**: Stream en vivo oficial de Kick (`https://player.kick.com/{canal}?autoplay=true&muted=false`).
  - **Columna Derecha (Chat ~23%)**: Chat oficial en tiempo real de Kick (`https://kick.com/{canal}/chatroom`) con opción de colapsar para expandir el área de video.
- 📱 **Diseño 100% Responsivo (Mobile & Tablet <768px)**:
  - Reorganización vertical fluida: Video principal (16:9) ➔ Cámara del Streamer ➔ Chat en vivo scrolleable.
- 🔗 **Configuración Dinámica por Parámetros URL**:
  - `?streamer=NOMBRE_CANAL`: Carga automáticamente el canal del streamer en player y chat.
  - `?video=URL_ENCODEADA`: Carga automáticamente la película o video.
- 🎨 **Estética Streamer Premium**:
  - Paleta nativa oscura (`#0b0e0f`, `#121517`, `#1f2326`) con acentos verde Kick (`#53fc18`), efectos glassmorphism y micro-animaciones.
- ⚡ **Sin Dependencias Pesadas**:
  - Cero frameworks. HTML5 semántico, CSS moderno y JavaScript Vanilla puro.
- 🔒 **Atributos de Seguridad de Iframes**:
  - `allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"`
  - `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"`

---

## 🚀 Ejemplos de Enlaces para Compartir

Puedes compartir directamente con tu comunidad enlaces parametrizados:

```text
# Con canal y video MP4 directo
https://tudominio.com/?streamer=xqc&video=https%3A%2F%2Fcommondatastorage.googleapis.com%2Fgtv-videos-bucket%2Fsample%2FBigBuckBunny.mp4

# Con canal y video de YouTube
https://tudominio.com/?streamer=westcol&video=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ

# Con servidor de streaming embed (Streamwish, Doodstream, etc.)
https://tudominio.com/?streamer=brunenger&video=https%3A%2F%2Fstreamwish.to%2Fe%2Fdemo123
```

---

## 🛠️ Despliegue Rápido

### Opción 1: Vercel
1. Instala la CLI de Vercel (`npm i -g vercel`) o sube la carpeta a tu repositorio de GitHub.
2. Importa el proyecto en [vercel.com](https://vercel.com) (automáticamente detecta archivos estáticos).
3. ¡Listo en segundos!

### Opción 2: GitHub Pages
1. Sube los archivos `index.html`, `styles.css` y `app.js` a tu repositorio en GitHub.
2. Ve a **Settings** ➔ **Pages**.
3. Selecciona la rama `main` (o `master`) y la carpeta `/root`.
4. Guarda y accede a tu enlace `https://usuario.github.io/repositorio/`.

### Opción 3: Netlify / Cloudflare Pages
- Simplemente arrastra y suelta la carpeta en el dashboard de Netlify Drop o conecta tu repositorio Git.

---

## 📂 Estructura del Proyecto

```
DualStream/
├── index.html       # Estructura semántica, modales y layout de dos columnas
├── styles.css       # Sistema de diseño, tema oscuro Kick y reglas responsive
├── app.js           # Lógica Vanilla JS, manejo de query params, iframes y modales
└── README.md        # Documentación de uso y despliegue
```
