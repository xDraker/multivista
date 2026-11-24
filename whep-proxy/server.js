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
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, If-Match, If-None-Match, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Location, ETag, Accept-Patch, Link, Content-Length, Content-Range, Accept-Ranges');
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


const dns = require('node:dns').promises;
const net = require('node:net');
const IPTV_ALLOWED_HOSTS = (process.env.IPTV_PROXY_ALLOWED_HOSTS || [
  'mdstrm.com','dps.live','dpsgo.com','rudo.video','making.cl',
  'intersurtv.cl','tlink.cl','senado.cl','15.204.196.147'
].join(',')).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const IPTV_PROXY_ORIGINS = (process.env.IPTV_PROXY_ORIGINS || '*').split(',').map(x=>x.trim()).filter(Boolean);

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const p=address.split('.').map(Number);
    return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||
      (p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||
      (p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);
  }
  if (net.isIPv6(address)) {
    const a=address.toLowerCase();
    return a==='::'||a==='::1'||a.startsWith('fc')||a.startsWith('fd')||
      a.startsWith('fe8')||a.startsWith('fe9')||a.startsWith('fea')||a.startsWith('feb')||
      a.startsWith('::ffff:127.')||a.startsWith('::ffff:10.')||a.startsWith('::ffff:192.168.');
  }
  return true;
}
async function validateIptvUrl(raw) {
  let u;
  try { u=new URL(raw); } catch { throw new Error('URL IPTV inválida'); }
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS');
  if (u.username||u.password) throw new Error('No se permiten credenciales embebidas en la URL');
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  const allowed=IPTV_ALLOWED_HOSTS.some(entry=>host===entry||(!net.isIP(host)&&host.endsWith('.'+entry)));
  if (!allowed) throw new Error('Dominio no autorizado para el proxy IPTV: '+host);
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('IP privada bloqueada');
  } else {
    const records=await dns.lookup(host,{all:true,verbatim:true});
    if (!records.length||records.some(r=>isPrivateIp(r.address))) throw new Error('Destino DNS privado o no válido');
  }
  return u;
}
function proxyUrlFor(rawUrl) {
  return '/iptv?url='+encodeURIComponent(rawUrl);
}
async function fetchIptvUpstream(initialUrl, req) {
  let target=await validateIptvUrl(initialUrl);
  for(let hop=0;hop<6;hop++){
    const headers={
      'User-Agent':req.headers['user-agent']||'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept':req.headers.accept||'*/*',
      'Accept-Encoding':'identity',
      'Origin':target.origin,
      'Referer':target.origin+'/'
    };
    if(req.headers.range)headers.Range=req.headers.range;
    const upstream=await fetch(target,{method:req.method==='HEAD'?'HEAD':'GET',headers,redirect:'manual',signal:AbortSignal.timeout(25000)});
    if([301,302,303,307,308].includes(upstream.status)){
      const location=upstream.headers.get('location');
      if(!location) return {upstream,target};
      target=await validateIptvUrl(new URL(location,target).href);
      continue;
    }
    return {upstream,target};
  }
  throw new Error('Demasiadas redirecciones IPTV');
}
async function handleIptvProxy(req,res,rawUrl) {
  if(!rawUrl)return sendText(res,400,'Missing url parameter');
  try{
    const {upstream,target}=await fetchIptvUpstream(rawUrl,req);
    res.statusCode=upstream.status;
    for(const name of ['content-type','content-length','content-range','accept-ranges','last-modified','etag','cache-control']){
      const value=upstream.headers.get(name);if(value)res.setHeader(name,value);
    }
    if(req.method==='HEAD'||!upstream.body)return res.end();
    const contentType=(upstream.headers.get('content-type')||'').toLowerCase();
    const isPlaylist=contentType.includes('mpegurl')||contentType.includes('application/vnd.apple.mpegurl')||
      (target.pathname.toLowerCase().endsWith('.m3u8')||target.pathname.toLowerCase().endsWith('.m3u'));
    if(isPlaylist){
      const bytes=Buffer.from(await upstream.arrayBuffer());
      if(bytes.length>4*1024*1024)return sendText(res,502,'Playlist IPTV demasiado grande');
      let text=bytes.toString('utf8').replace(/^\uFEFF/,'');
      if(text.trimStart().startsWith('#EXTM3U')){
        const rewrite=(uri)=>proxyUrlFor(new URL(uri,target).href);
        text=text.split(/\r?\n/).map(line=>{
          const trimmed=line.trim();
          if(!trimmed)return line;
          if(trimmed.startsWith('#')){
            return line.replace(/URI=(["'])(.*?)\1/g,(all,q,uri)=>'URI='+q+rewrite(uri)+q);
          }
          return rewrite(trimmed);
        }).join('\n');
        const body=Buffer.from(text,'utf8');
        res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Content-Length',String(body.length));
        return res.end(body);
      }
      return res.end(bytes);
    }
    const {Readable}=require('node:stream');
    Readable.fromWeb(upstream.body).pipe(res);
  }catch(error){
    sendText(res,502,'IPTV proxy error: '+(error.message||'upstream failure'));
  }
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

  if ((req.method === 'GET' || req.method === 'HEAD') && requestUrl.pathname === '/iptv') {
    return handleIptvProxy(req, res, requestUrl.searchParams.get('url'));
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
