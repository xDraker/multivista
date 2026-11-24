# Proxy WHEP de cámaras Ledrium

Servicio de señalización HTTP para las cámaras Ledrium. El vídeo/audio viaja directamente por WebRTC entre el navegador y Ledrium; este servicio solo reenvía la negociación WHEP y el endpoint ICE para evitar el bloqueo CORS desde GitHub Pages.

## Despliegue en Render

El archivo `render.yaml` de la raíz crea este servicio como `multivista-ledrium-proxy`.

- Runtime: Node
- Región: Oregon
- Health check: `/healthz`
- URL esperada: `https://multivista-ledrium-proxy.onrender.com`

El proxy limita las rutas a las seis cámaras detectadas en el HAR y no funciona como proxy HTTP abierto.
