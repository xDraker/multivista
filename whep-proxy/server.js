'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const UPSTREAM = 'https://ledrium.live';
const PORT = Number(process.env.PORT || 10000);
const CAMERA_IDS = new Set([
  'cam1',
  'cam2',
  'cam3',
  'cam2_botanico',
  'cam1_botanico',
  'cam_ph'
]);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, If-Match, If-None-Match, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Location, ETag, Accept-Patch, Link');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
}

function sendText(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://localhost');
  } catch {
    return sendText(res, 400, 'Invalid URL');
  }

  if (req.method === 'GET' && requestUrl.pathname === '/healthz') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, service: 'multivista-ledrium-whep-proxy' }));
  }

  let upstreamUrl;
  if (req.method === 'GET' && requestUrl.pathname === '/api/stream/ice') {
    upstreamUrl = new URL('/api/stream/ice', UPSTREAM);
  } else {
    const match = requestUrl.pathname.match(/^\/api\/stream\/whep\/([a-z0-9_]+)$/i);
    if (!match || !CAMERA_IDS.has(match[1])) {
      return sendText(res, 404, 'Unknown camera endpoint');
    }
    if (!ALLOWED_METHODS.has(req.method) || req.method === 'GET') {
      return sendText(res, 405, 'Method not allowed');
    }
    upstreamUrl = new URL('/api/stream/whep/' + match[1] + requestUrl.search, UPSTREAM);
  }

  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
    return sendText(res, 405, 'Method not allowed');
  }

  try {
    const headers = {
      Accept: req.headers.accept || '*/*',
      Origin: UPSTREAM,
      Referer: UPSTREAM + '/'
    };
    for (const name of ['content-type', 'if-match', 'if-none-match', 'authorization']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }

    const options = { method: req.method, headers, redirect: 'manual' };
    if (req.method === 'POST' || req.method === 'PATCH') {
      options.body = await readBody(req);
    }

    const upstream = await fetch(upstreamUrl, options);
    res.statusCode = upstream.status;

    for (const name of ['content-type', 'etag', 'accept-patch', 'link', 'cache-control']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    const location = upstream.headers.get('location');
    if (location) {
      const resolved = new URL(location, UPSTREAM);
      res.setHeader('Location', resolved.pathname + resolved.search);
    }

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.end(payload);
  } catch (error) {
    sendText(res, 502, 'Upstream Ledrium error: ' + (error.message || 'request failed'));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Ledrium WHEP proxy listening on 0.0.0.0:' + PORT);
});
