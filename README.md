# Multivista

Dashboard web para visualizar entre 4 y 6 fuentes de vídeo en una distribución configurable.

## Fuentes compatibles
- YouTube y YouTube Live mediante YouTube IFrame Player API.
- Listas M3U: importa un archivo local y se extraen sus enlaces HTTP/HTTPS.
- HLS (.m3u8) mediante hls.js o reproducción HLS nativa del navegador.
- Vídeo directo compatible con HTML5, por ejemplo MP4.

## Uso
1. Abre la aplicación.
2. Agrega un enlace o importa una lista .m3u.
3. Presiona **Reproducir** en cada panel.
4. Usa el control de tamaño para alternar entre pequeño, normal, ancho y completo.
5. Activa **Editar diseño** para arrastrar paneles y reordenarlos.
6. Guarda la vista; paneles y preferencias quedan en LocalStorage.

## Límites importantes
- M3U es un formato de lista de referencias, no un formato de vídeo. Cada URL incluida debe ser reproducible por el navegador.
- Los enlaces HLS deben permitir CORS desde el dominio de la aplicación.
- RTSP, UDP multicast y enlaces IPTV privados no se reproducen directamente en GitHub Pages; requieren un gateway que los convierta a HLS o WebRTC.
- YouTube puede bloquear la reproducción incrustada para determinados vídeos/canales. La calidad depende de YouTube y de la conexión; 1080p es una meta, no una garantía.
- Los navegadores pueden restringir autoplay y reproducción simultánea de audio. El audio se inicia silenciado y puede activarse individualmente por panel.

## Publicación
En GitHub: **Settings → Pages → Deploy from a branch → main → /(root)**.


## Reproducción IPTV con fallback automático

Para los enlaces IPTV HTTP/HTTPS, Multivista intenta primero la URL original desde el navegador. Si HLS.js detecta un error fatal de red/manifiesto/segmento, o el elemento de vídeo falla o no comienza a reproducir dentro del tiempo de espera, cambia automáticamente al proxy HTTPS de Render.

- Se conserva la URL original en la configuración local del panel.
- El proxy reescribe manifiestos HLS y enruta segmentos, claves y playlists anidadas.
- También puede retransmitir fuentes directas compatibles con HTML5/MPEG-TS.
- YouTube y las cámaras Ledrium/WHEP mantienen sus rutas de reproducción actuales.
- Multivista recuerda localmente qué método consiguió reproducir cada URL y acorta el tiempo del siguiente fallback, sin saltarse el intento directo inicial.

### Seguridad del proxy IPTV

El endpoint `/iptv?url=` no es un proxy HTTP abierto. Solo acepta HTTP/HTTPS hacia dominios de una lista permitida, sigue un máximo de cinco redireccionamientos y vuelve a validar cada destino. Rechaza credenciales embebidas, IP privadas y destinos DNS privados. La lista se configura mediante `IPTV_PROXY_ALLOWED_HOSTS` (dominios separados por coma).

La lista inicial contempla proveedores presentes en las playlists del proyecto: `mdstrm.com`, `dps.live`, `dpsgo.com`, `rudo.video`, `making.cl`, `intersurtv.cl`, `tlink.cl`, `senado.cl` y la IP pública usada por Mega 2/Meganoticias.

### Limitaciones

El proxy puede resolver CORS, Mixed Content, redirecciones y diferencias de cabeceras HTTP habituales. No elimina DRM, geobloqueos, autenticación obligatoria, tokens vencidos ni incompatibilidades de códec. No transcodifica vídeo.
