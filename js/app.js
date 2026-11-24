const STORE='multivista-v1';
window.addEventListener('error',e=>{const box=document.querySelector('#toast');if(box){box.textContent='Error de la aplicación: '+(e.message||'JavaScript');box.classList.add('show')}});
window.addEventListener('unhandledrejection',e=>{const box=document.querySelector('#toast');if(box){box.textContent='Error: '+(e.reason?.message||String(e.reason));box.classList.add('show')}});

const dashboard=document.querySelector('#dashboard'),emptyState=document.querySelector('#emptyState'),countEl=document.querySelector('#streamCount'),dialog=document.querySelector('#addDialog'),form=document.querySelector('#addForm'),toastEl=document.querySelector('#toast');
let streams=[],players=new Map(),editMode=false,toastTimer;
let backgroundHost=null;
function getBackgroundHost(){if(!backgroundHost){backgroundHost=document.createElement('div');backgroundHost.id='backgroundPlayers';backgroundHost.setAttribute('aria-hidden','true');backgroundHost.style.cssText='position:fixed;left:-10000px;top:0;width:640px;height:360px;overflow:hidden;pointer-events:none;z-index:-1';document.body.append(backgroundHost)}return backgroundHost}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2600)}
function id(){return 'p'+Math.random().toString(36).slice(2,10)}
function youtubeId(url){try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return u.pathname.slice(1).split('/')[0];if(u.hostname.includes('youtube.com')||u.hostname.includes('youtube-nocookie.com')){if(u.pathname==='/watch')return u.searchParams.get('v');const m=u.pathname.match(/\/(?:embed|live|shorts)\/([^/?]+)/);return m?.[1]||null}}catch{}return null}
function classify(url){if(youtubeId(url))return'youtube';if(/\.m3u8?(?:$|[?#])/i.test(url))return'hls';if(/\.ts(?:$|[?#])/i.test(url))return'mpegts';return'video'}
function save(){localStorage.setItem(STORE,JSON.stringify(streams.map(({id,name,url,size,tall,muted})=>({id,name,url,size,tall,muted}))));}
function load(){try{streams=JSON.parse(localStorage.getItem(STORE)||'[]').slice(0,6)}catch{streams=[]}render()}
function addStream(name,url){if(streams.length>=6){toast('Máximo de 6 paneles');return}if(!url||!/^https?:\/\//i.test(url)){toast('Introduce una URL válida (http o https)');return}streams.push({id:id(),name:name.trim()||'Transmisión '+(streams.length+1),url,size:'medium',tall:false,muted:true});save();render();toast('Panel agregado')}
function removeStream(pid){const card=dashboard.querySelector('[data-id="'+pid+'"]'),wrap=card?.querySelector('.player-wrap');if(wrap&&players.has(pid)){const slot=document.createElement('div');slot.style.cssText='position:relative;width:640px;height:360px;overflow:hidden';while(wrap.firstChild)slot.append(wrap.firstChild);getBackgroundHost().append(slot);const entry=players.get(pid);if(entry)entry.backgroundSlot=slot;}else destroyPlayer(pid);streams=streams.filter(s=>s.id!==pid);save();render();toast('Panel cerrado; la transmisión continúa en segundo plano')}
function replaceStream(pid,channel){const current=streams.find(s=>s.id===pid);if(!current)return false;const entry=players.get(pid);if(entry?.backgroundSlot)entry.backgroundSlot.remove();destroyPlayer(pid);current.name=channel.name;current.url=channel.url;current.muted=true;save();render();const card=dashboard.querySelector('[data-id="'+pid+'"]'),wrap=card?.querySelector('.player-wrap');if(card&&wrap)startPlayer(current,wrap,card);return true}
function askPanelToReplace(channel,onSuccess){let picker=document.querySelector('#replacePanelDialog');if(!picker){picker=document.createElement('dialog');picker.id='replacePanelDialog';picker.className='dialog replace-dialog';picker.innerHTML='<div class="dialog-head"><div><h2>Reemplazar un panel</h2><p>Ya tienes 6 paneles ocupados. ¿Cuál deseas reemplazar por este canal?</p></div><button type="button" class="icon-button" data-close aria-label="Cerrar">×</button></div><div class="replace-panel-list"></div><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button></div>';picker.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>picker.close()));document.body.append(picker)}const list=picker.querySelector('.replace-panel-list');list.innerHTML='';streams.forEach((stream,index)=>{const button=document.createElement('button');button.type='button';button.className='replace-panel-option';const name=document.createElement('strong');name.textContent='Panel '+(index+1)+': '+stream.name;const source=document.createElement('small');source.textContent=stream.url;button.append(name,source);button.addEventListener('click',()=>{if(replaceStream(stream.id,channel)){picker.close();if(onSuccess)onSuccess();toast('Panel '+(index+1)+' reemplazado por '+channel.name)}});list.append(button)});if(typeof picker.showModal==='function')picker.showModal();else picker.setAttribute('open','')}
function destroyPlayer(pid){const p=players.get(pid);if(p){try{if(p.player?.destroy)p.player.destroy();if(p.hls)p.hls.destroy();if(p.mpegts)p.mpegts.destroy()}catch{}players.delete(pid)}}
function render(){const liveNodes=new Map();for(const s of streams){const oldWrap=dashboard.querySelector('[data-id=\"'+s.id+'\"] .player-wrap');if(oldWrap&&players.has(s.id)&&oldWrap.childNodes.length)liveNodes.set(s.id,Array.from(oldWrap.childNodes));}dashboard.innerHTML='';const n=streams.length,cols=n>=5?3:n>=3?2:n||1,rows=Math.max(1,Math.ceil(n/cols));dashboard.className='dashboard panels-'+n;dashboard.style.height=n?'calc(100vh - 235px)':'auto';dashboard.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';dashboard.style.gridTemplateRows=n?'repeat('+rows+',minmax(0,1fr))':'none';countEl.textContent=streams.length+' / 6 PANELES';emptyState.hidden=streams.length>0;for(const s of streams){const card=document.createElement('article');card.className='panel '+(s.size==='small'?'small':s.size==='wide'?'wide':s.size==='full'?'full':'')+(s.tall?' tall':'');card.dataset.id=s.id;card.draggable=editMode;
const head=document.createElement('div');head.className='panel-head';head.innerHTML='<span class="panel-name"></span><span class="panel-state">● LISTO</span><div class="panel-tools"></div>';head.querySelector('.panel-name').textContent=s.name;
const tools=head.querySelector('.panel-tools');const addTool=(label,title,fn)=>{const b=document.createElement('button');b.className='icon-button';b.textContent=label;b.title=title;b.onclick=fn;tools.append(b)};
addTool('↗','Cambiar tamaño',()=>cycleSize(s));addTool(s.muted?'🔇':'🔊','Activar o silenciar audio',()=>toggleMute(s));addTool('⛶','Maximizar panel',()=>maximize(card));addTool('×','Quitar panel',()=>removeStream(s.id));
const wrap=document.createElement('div');wrap.className='player-wrap';wrap.id='player-'+s.id;const placeholder=document.createElement('div');placeholder.className='placeholder';placeholder.innerHTML='<b>▶</b>Presiona reproducir para iniciar';const play=document.createElement('button');play.className='button primary';play.textContent='▶ Reproducir';play.onclick=()=>startPlayer(s,wrap,card);placeholder.append(document.createElement('br'),play);wrap.append(placeholder);if(liveNodes.has(s.id)){wrap.innerHTML='';liveNodes.get(s.id).forEach(node=>wrap.append(node));}
const foot=document.createElement('div');foot.className='panel-foot';const type=classify(s.url).toUpperCase();const urlText=document.createElement('span');urlText.textContent=type+' · '+(new URL(s.url).hostname);const change=document.createElement('button');change.textContent='Cambiar fuente';change.onclick=()=>changeSource(s);foot.append(urlText,change);card.append(head,wrap,foot);dashboard.append(card);
card.addEventListener('dragstart',e=>{if(!editMode){e.preventDefault();return}card.classList.add('dragging');e.dataTransfer.setData('text/plain',s.id)});card.addEventListener('dragend',()=>card.classList.remove('dragging'));card.addEventListener('dragover',e=>{if(editMode)e.preventDefault()});card.addEventListener('drop',e=>{if(!editMode)return;e.preventDefault();const from=e.dataTransfer.getData('text/plain'),to=s.id;const a=streams.findIndex(x=>x.id===from),b=streams.findIndex(x=>x.id===to);if(a<0||b<0)return;const [m]=streams.splice(a,1);streams.splice(b,0,m);const dragged=dashboard.querySelector('[data-id="'+from+'"]');const target=dashboard.querySelector('[data-id="'+to+'"]');if(dragged&&target){const rect=target.getBoundingClientRect();if(e.clientY>rect.top+rect.height/2)target.after(dragged);else target.before(dragged)}save()});
}document.querySelector('#editBtn').textContent=editMode?'Terminar edición':'Editar diseño';document.body.classList.toggle('edit-mode',editMode)}
function cycleSize(s){const sizes=['small','medium','wide','full'];s.size=sizes[(sizes.indexOf(s.size||'medium')+1)%sizes.length];const card=dashboard.querySelector('[data-id="'+s.id+'"]');if(card){card.classList.remove('small','wide','full');if(s.size!=='medium')card.classList.add(s.size)}save()}
function toggleMute(s){s.muted=!s.muted;const p=players.get(s.id);if(p?.player?.mute){if(s.muted)p.player.mute();else p.player.unMute()}if(p?.video)p.video.muted=s.muted;const card=dashboard.querySelector('[data-id="'+s.id+'"]');const button=card?.querySelector('.panel-tools button:nth-child(2)');if(button){button.textContent=s.muted?'🔇':'🔊';button.title=s.muted?'Activar audio':'Silenciar audio'}save()}
function maximize(card){const was=card.classList.contains('full');card.classList.toggle('full',!was);card.classList.toggle('maximized',!was);if(!was)card.scrollIntoView({behavior:'smooth',block:'center'});else card.classList.remove('maximized')}
function changeSource(s){const next=prompt('Pega la nueva URL de YouTube o M3U8:',s.url);if(!next)return;if(!/^https?:\/\//i.test(next)){toast('URL no válida');return}destroyPlayer(s.id);s.url=next.trim();save();render()}
function startPlayer(s,wrap,card){destroyPlayer(s.id);wrap.innerHTML='';const state=card.querySelector('.panel-state');state.textContent='● CONECTANDO';const kind=classify(s.url);
if(kind==='youtube'){const host=document.createElement('div');host.id='yt-'+s.id;host.style.cssText='position:absolute;inset:0';wrap.append(host);const create=()=>{const player=new YT.Player(host.id,{videoId:youtubeId(s.url),width:'100%',height:'100%',playerVars:{autoplay:1,controls:1,playsinline:1,rel:0,modestbranding:1},events:{onReady:e=>{if(s.muted)e.target.mute();else e.target.unMute();state.textContent='● YOUTUBE'},onStateChange:e=>{state.textContent=e.data===1?'● EN VIVO / REPRODUCIENDO':e.data===3?'● CARGANDO':e.data===0?'● FINALIZADO':'● YOUTUBE'},onError:()=>{state.textContent='● NO DISPONIBLE';toast('YouTube no permite reproducir este vídeo incrustado')}}});players.set(s.id,{player})};if(window.YT?.Player)create();else window.onYouTubeIframeAPIReady=()=>create();
}else{const video=document.createElement('video');video.controls=true;video.autoplay=true;video.playsInline=true;video.muted=s.muted;wrap.append(video);const entry={video};players.set(s.id,entry);if(kind==='mpegts'&&window.mpegts?.isSupported()){const player=mpegts.createPlayer({type:'mpegts',url:s.url,isLive:true});player.attachMediaElement(video);player.load();player.play().catch(()=>{});entry.mpegts=player;state.textContent='● MPEG-TS'}else if(kind==='mpegts'){state.textContent='● NO COMPATIBLE';toast('Este navegador no admite reproducción MPEG-TS')}else if(kind==='hls'){if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=s.url;else if(window.Hls?.isSupported()){const hls=new Hls({enableWorker:true,capLevelToPlayerSize:true});hls.loadSource(s.url);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>{state.textContent='● HLS';video.play().catch(()=>toast('Presiona reproducir en el vídeo'))});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){state.textContent='● ERROR DE FUENTE';toast('No se pudo cargar HLS. Revisa URL y CORS')}});entry.hls=hls}else{state.textContent='● NO COMPATIBLE';toast('Este navegador no admite HLS')}}else{video.src=s.url;video.addEventListener('loadedmetadata',()=>state.textContent='● CONECTADO',{once:true});video.addEventListener('error',()=>{state.textContent='● ERROR';toast('No se pudo reproducir esta URL')})}video.play().catch(()=>{})}}

async function importRemotePlaylist(presetUrl){
 const raw=presetUrl||prompt('Pega la URL pública de la lista .m3u o .m3u8:');
 if(!raw)return;
 let url;
 try{
  url=new URL(String(raw ?? '').trim());
  if(!/^https?:$/.test(url.protocol))throw new Error('La dirección debe comenzar con http:// o https://');
 }catch(err){toast(err.message||'URL no válida');return}
 const available=6-streams.length;
 if(available<=0){toast('Ya tienes 6 paneles. Elimina uno antes de importar.');return}
 const info=document.querySelector('#playlistInfo');
 const showError=message=>{
  info.hidden=false;info.textContent=message;toast(message);
 };
 function githubFileApi(u){
  if(u.hostname!=='raw.githubusercontent.com')return null;
  const p=u.pathname.split('/').filter(Boolean);
  if(p.length<4)return null;
  let branch,path;
  if(p[2]==='refs'&&p[3]==='heads'){branch=p[4];path=p.slice(5)}
  else{branch=p[2];path=p.slice(3)}
  if(!branch||!path.length)return null;
  return 'https://api.github.com/repos/'+p[0]+'/'+p[1]+'/contents/'+path.map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch);
 }
 async function fetchText(target){
  const response=await fetch(target,{cache:'no-store',headers:{'Accept':'application/vnd.github.raw, text/plain, */*'}});
  if(!response.ok)throw new Error('El servidor respondió HTTP '+response.status);
  return await response.text();
 }
 async function fetchGitHubApi(api){
  const response=await fetch(api,{cache:'no-store',headers:{'Accept':'application/vnd.github+json'}});
  if(!response.ok)throw new Error('GitHub API respondió HTTP '+response.status);
  const data=await response.json();
  if(typeof data.content!=='string')throw new Error('GitHub no entregó el contenido del archivo');
  const binary=atob(data.content.replace(/\s/g,''));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
 }
 try{
  info.hidden=false;info.textContent='Conectando con la lista remota…';toast('Descargando lista…');
  let content,lastError;
  const api=githubFileApi(url);
  if(api){
   try{content=await fetchGitHubApi(api)}catch(err){lastError=err}
  }
  if(typeof content!=='string'){
   try{content=await fetchText(url.href)}catch(err){lastError=err}
  }
  if(typeof content!=='string')throw lastError||new Error('No se pudo descargar el archivo');
  content=content.replace(/^\uFEFF/,'').trim();
  if(!content.startsWith('#EXTM3U'))throw new Error('El archivo no comienza con #EXTM3U. Comprueba que el enlace apunte al archivo M3U y no a una página web.');
  const lines=content.split(/\r?\n/);
  const found=[];let name='';
  for(const rawLine of lines){
   const line=rawLine.trim();
   if(!line)continue;
   if(line.startsWith('#EXTINF')){
    const comma=line.indexOf(',');
    name=comma>=0?line.slice(comma+1).trim():'Canal '+(found.length+1);
    continue;
   }
   if(line.startsWith('#'))continue;
   try{
    const streamUrl=new URL(line,url.href);
    if(/^https?:$/.test(streamUrl.protocol)){
     found.push({name:name||'Canal '+(found.length+1),url:streamUrl.href});
     name='';
    }
   }catch{}
  }
  if(!found.length){
   if(/#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|STREAM-INF|ENDLIST|PLAYLIST-TYPE|VERSION)/i.test(content)){
    addStream(url.pathname.split('/').pop()||'Transmisión HLS',url.href);
    info.textContent='Se detectó un manifiesto HLS individual. Se creó un panel; pulsa Reproducir para iniciar.';
    return;
   }
   throw new Error('La lista se descargó, pero no contiene enlaces HTTP/HTTPS reconocibles.');
  }
  const selected=found.slice(0,available);
  for(const item of selected){
   streams.push({id:id(),name:item.name,url:item.url,size:'medium',tall:false,muted:true});
  }
  save();render();
  info.hidden=false;
  info.textContent='Importación correcta: '+found.length+' canales detectados; '+selected.length+' paneles creados. '+(found.length>selected.length?'Quedan '+(found.length-selected.length)+' canales por importar porque el máximo es 6.':'');
  toast('Se crearon '+selected.length+' paneles');
 }catch(err){
  console.error('Multivista importRemotePlaylist:',err);
  showError('No se pudo importar la lista: '+(err?.message||'error desconocido'));
 }
}
function toggleDialog(){document.querySelector('#streamName').value='';document.querySelector('#streamUrl').value='';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
document.querySelector('#remoteM3uBtn').onclick=()=>importRemotePlaylist();
async function showRemoteChannels(rawUrl){
 const browser=document.querySelector('#channelBrowser'),list=document.querySelector('#channelList'),label=document.querySelector('#channelListCount');
 browser.hidden=false;list.innerHTML='<div class="channel-loading">Cargando canales…</div>';
 browser.scrollIntoView({behavior:'smooth',block:'start'});
 try{
  const u=new URL(rawUrl);
  let textContent='';
  if(u.hostname==='raw.githubusercontent.com'){
   const p=u.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part));let branch,path;
   if(p[2]==='refs'&&p[3]==='heads'){branch=p[4];path=p.slice(5)}else{branch=p[2];path=p.slice(3)}
   if(p.length>=4&&branch&&path.length){
    const api='https://api.github.com/repos/'+p[0]+'/'+p[1]+'/contents/'+path.map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch);
    const response=await fetch(api,{headers:{'Accept':'application/vnd.github+json'},cache:'no-store'});
    if(!response.ok)throw new Error('GitHub respondió HTTP '+response.status);
    const data=await response.json();
    if(typeof data.content!=='string')throw new Error('GitHub no entregó el archivo M3U');
    const binary=atob(data.content.replace(/\s/g,''));
    textContent=new TextDecoder().decode(Uint8Array.from(binary,ch=>ch.charCodeAt(0)));
   }
  }
  if(!textContent){
   const response=await fetch(rawUrl,{cache:'no-store'});
   if(!response.ok)throw new Error('El servidor respondió HTTP '+response.status);
   textContent=await response.text();
  }
  textContent=textContent.replace(/^\uFEFF/,'');
  if(!textContent.trim().startsWith('#EXTM3U'))throw new Error('El archivo no contiene una lista M3U válida');
  const channels=[];let pendingName='',pendingHasExtinf=false;
  for(const raw of textContent.split(/\r?\n/)){
   const line=String(raw ?? '').trim();if(!line)continue;
   if(line.startsWith('#EXTINF')){
    const comma=line.indexOf(',');
    pendingName=comma>=0?line.slice(comma+1).trim():'';
    const tvgName=line.match(/tvg-name=["']([^"']+)["']/i)?.[1]?.trim();
    if(!pendingName&&tvgName)pendingName=tvgName;
    pendingHasExtinf=true;
    continue;
   }
   if(line.startsWith('#'))continue;
   try{
    const streamUrl=new URL(line,u.href);
    if(/^https?:$/.test(streamUrl.protocol)){
     const fallbackName=streamUrl.hostname.replace(/^www\./i,'');
     channels.push({name:pendingName||fallbackName,url:streamUrl.href});
     pendingName='';pendingHasExtinf=false;
    }
   }catch{}
  }
  if(!channels.length)throw new Error('No se encontraron canales en la lista');
  label.textContent=channels.length+' canales · Elige cuáles quieres reproducir';
  list.innerHTML='';
  channels.forEach((channel,index)=>{
   const item=document.createElement('article');item.className='channel-item';
   const number=document.createElement('span');number.className='channel-number';number.textContent=String(index+1).padStart(2,'0');
   const details=document.createElement('div');details.className='channel-details';
   const title=document.createElement('strong');title.textContent=channel.name;
   const host=document.createElement('small');host.textContent=new URL(channel.url).hostname;
   details.append(title,host);
   const add=document.createElement('button');add.className='button primary channel-add';add.textContent='▶ Reproducir';
   add.disabled=streams.length>=6;
   const chooseChannel=()=>{
    const finishSelection=()=>{item.remove();const remaining=list.querySelectorAll('.channel-item').length;label.textContent=remaining+' canales disponibles · Selecciona uno para reproducir';};
    if(streams.length>=6){askPanelToReplace(channel,finishSelection);return}
    const stream={id:id(),name:channel.name,url:channel.url,size:'medium',tall:false,muted:true};
    streams.push(stream);save();render();
    const card=dashboard.querySelector('[data-id="'+stream.id+'"]'),wrap=card?.querySelector('.player-wrap');
    if(card&&wrap)startPlayer(stream,wrap,card);
    finishSelection();toast(channel.name+' reproduciéndose');
   };
   item.addEventListener('click',chooseChannel);
   add.addEventListener('click',event=>{event.stopPropagation();chooseChannel()});
   item.append(number,details,add);list.append(item);
  });
 }catch(err){list.innerHTML='';const error=document.createElement('p');error.className='channel-error';error.textContent='No se pudo cargar la lista: '+err.message;list.append(error);label.textContent='Error al leer la lista';}
}
const channelDropdown=document.querySelector('#channelDropdownBtn');
const channelBrowser=document.querySelector('#channelBrowser');
channelDropdown.onclick=()=>{
 if(channelBrowser.hidden){
  channelDropdown.setAttribute('aria-expanded','true');
  channelDropdown.textContent='Lista de Canales ▴';
  showRemoteChannels('https://raw.githubusercontent.com/xDraker/TV_Chile_Grabable/refs/heads/main/TV%20Chile%20Grabable');
 }else{
  channelBrowser.hidden=true;
  channelDropdown.setAttribute('aria-expanded','false');
  channelDropdown.textContent='Lista de Canales ▾';
 }
};
document.querySelector('#hideChannelsBtn').onclick=()=>{document.querySelector('#channelBrowser').hidden=true;channelDropdown.setAttribute('aria-expanded','false');channelDropdown.textContent='Lista de Canales ▾'};
document.querySelector('#refreshChannelsBtn').onclick=()=>showRemoteChannels('https://raw.githubusercontent.com/xDraker/TV_Chile_Grabable/refs/heads/main/TV%20Chile%20Grabable');


document.querySelector('#addBtn').onclick=toggleDialog;
document.querySelector('#playAllBtn').onclick=()=>{let started=0;for(const s of streams){const card=dashboard.querySelector('[data-id=\"'+s.id+'\"]'),wrap=card?.querySelector('.player-wrap');if(card&&wrap){startPlayer(s,wrap,card);started++}}toast(started?'Iniciando '+started+' transmisiones':'No hay paneles para reproducir')};document.querySelector('#emptyAddBtn').onclick=toggleDialog;document.querySelector('#closeDialog').onclick=()=>{if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')};document.querySelector('#cancelDialog').onclick=()=>{if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')};
form.addEventListener('submit',e=>{e.preventDefault();addStream(document.querySelector('#streamName').value,document.querySelector('#streamUrl').value.trim());dialog.close()});
document.querySelector('#editBtn').onclick=()=>{editMode=!editMode;document.body.classList.toggle('edit-mode',editMode);dashboard.querySelectorAll('.panel').forEach(card=>card.draggable=editMode);document.querySelector('#editBtn').textContent=editMode?'Terminar edición':'Editar diseño';toast(editMode?'Arrastra los paneles para reordenarlos':'Edición finalizada')};
function setCleanView(enabled){document.body.classList.toggle('clean-view',enabled)}
document.addEventListener('keydown',event=>{
 if(event.key==='F11'&&!event.repeat){setCleanView(!document.body.classList.contains('clean-view'))}
});
document.addEventListener('fullscreenchange',()=>setCleanView(Boolean(document.fullscreenElement)));
document.querySelector('#fullscreenBtn').onclick=()=>{
 if(!document.fullscreenElement){
  setCleanView(true);
  const request=document.documentElement.requestFullscreen?.();
  if(request?.catch)request.catch(()=>setCleanView(true));
 }else document.exitFullscreen?.();
};
document.querySelector('#saveBtn').onclick=()=>{save();toast('Distribución guardada en este dispositivo')};
document.querySelector('#m3uFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const text=await file.text();const lines=text.split(/\r?\n/);let name='';const found=[];for(const raw of lines){const line=String(raw ?? '').trim();if(!line)continue;if(line.startsWith('#EXTINF')){name=line.split(',').slice(1).join(',').trim()||'Canal '+(found.length+1);continue}if(line.startsWith('#'))continue;if(/^https?:\/\//i.test(line)){found.push({name:name||'Canal '+(found.length+1),url:line});name=''}}if(!found.length){toast('No encontré enlaces HTTP/HTTPS en la lista');return}let added=0;for(const item of found.slice(0,6-streams.length)){addStream(item.name,item.url);added++}document.querySelector('#playlistInfo').hidden=false;document.querySelector('#playlistInfo').textContent='Lista '+file.name+': '+found.length+' fuentes encontradas, '+added+' paneles agregados. Puedes añadir más canales después.';toast(added+' fuentes importadas');}catch(err){toast('No se pudo leer el archivo M3U')}e.target.value=''});
load();
