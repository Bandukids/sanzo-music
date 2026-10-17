import { artworkURL } from '/artwork.js';
import { createPlaybackClock } from '/playback-clock.js';
import { communityTracks as demoTracks, creators, genres, defaultAlbums } from '/music-catalog.js';
import { SoundEngine } from '/sound-engine.js';
import { initWorkspaceMotion } from '/workspace-motion.js';
import { initImmersiveLyrics } from '/immersive-lyrics.js';
import { initPlayerLyrics } from '/player-visuals.js';
import { lyricsFile, songFile, saveDownload, downloadName } from '/music-downloads.js';
import { openCloudState, saveCloudState, peekCloudState } from '/cloud-state.js';

import { loadPublishedTracks } from '/published-music.js';
const tracks=[...demoTracks];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const time = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const count = n => n>=1000?(n/1000).toFixed(1)+'k':String(n);
const trackById = id => tracks.find(t=>t.id===id);
const workspaceKey = 'sanzo-workspace-v2', socialKey = 'sanzo-explore-v1';
function read(key,fallback={}){return peekCloudState(key===workspaceKey?'workspace':'explore')||fallback;}
await Promise.all([openCloudState('workspace'),openCloudState('explore')]);
let workspace = read(workspaceKey), social = read(socialKey);
workspace.albums=Array.isArray(workspace.albums)?workspace.albums:defaultAlbums();
workspace.liked=Array.isArray(workspace.liked)?workspace.liked:['blue','deep'];
social.follows=Array.isArray(social.follows)?social.follows:[];
social.comments=social.comments&&typeof social.comments==='object'?social.comments:{};
let recommend='best',query=(new URLSearchParams(location.search).get('q')||'').slice(0,120),genre='all',creatorFilter=null,collection=false,albumFilter='liked';
let current=trackById('afterglow'),playing=false,elapsed=0,startedAt=0,operation=0,shuffled=false,repeating=false,volume=55,lastVolume=55;
let queue=tracks.slice().sort((a,b)=>b.score-a.score).map(t=>t.id),playerTab='about',seekDragging=false;
const sound=new SoundEngine();
const nativeAudio=new Audio();nativeAudio.preload='metadata';
const playbackClock=createPlaybackClock(tickPlayback);
const immersiveLyrics=initImmersiveLyrics({seek:seekTo});
const dockLyrics=initPlayerLyrics({seek:seekTo});
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function saveSocial(){saveCloudState('explore',social);}
function saveWorkspace(){const latest=read(workspaceKey);workspace={...latest,albums:workspace.albums,liked:workspace.liked};saveCloudState('workspace',workspace);}
function filteredTracks(){return tracks.filter(t=>(genre==='all'||t.style===genre)&&(!creatorFilter||t.creator===creatorFilter)&&(recommend!=='following'||social.follows.includes(t.creator))&&`${t.title} ${t.artist} ${t.tags.join(' ')} ${genres.find(g=>g.id===t.style)?.name||''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.published!==b.published?(a.published?-1:1):a.published?b.fresh-a.fresh:recommend==='choice'?b.likes-a.likes:recommend==='fresh'?b.fresh-a.fresh:b.score-a.score);}
function songCard(t,i=0){const liked=workspace.liked.includes(t.id);return `<article class="song-card ${playing&&current.id===t.id?'is-playing':''}" data-track="${t.id}" style="--order:${Math.min(i,5)}"><button class="song-art cover-${t.cover}" data-play-track="${t.id}" aria-label="${playing&&current.id===t.id?'正在播放':'播放'} ${esc(t.title)}" title="单击播放，双击展开播放器">${cover(t)}<span class="art-duration">${time(t.duration)}</span><span class="art-play">${icon(playing&&current.id===t.id?'pause':'play')}</span></button><div class="song-title-row"><h3 title="${esc(t.title)}"><button class="title-play" data-play-track="${t.id}" aria-label="播放歌曲 ${esc(t.title)}">${esc(t.title)}</button></h3><button class="icon-button like-button" data-like="${t.id}" aria-label="${liked?'取消收藏':'收藏'} ${esc(t.title)}" aria-pressed="${liked}">${icon('heart')}</button></div><button class="artist-link" data-creator="${t.creator}">${esc(t.artist)}</button><span class="song-tag">${esc(t.tags[0])}</span><div class="song-bottom"><span>${count(t.plays)} 次播放</span><div class="song-actions"><button class="icon-button" data-comments="${t.id}" aria-label="评论 ${esc(t.title)}">${icon('comment')}</button><button class="icon-button" data-collect="${t.id}" aria-label="将 ${esc(t.title)} 收藏至专辑">${icon('album')}</button></div></div></article>`;}
function cover(t){return `<img decoding="async" src="${artworkURL(t.art)}" alt="${esc(t.title)} 演示封面" loading="lazy"><span class="cover-lettering"><small>${t.published?'SANZO / SINGLE':'SANZO / DEMO'}</small><span>${esc(t.caption)}</span></span>`;}
function renderSpotlights(){const featured=trackById('afterglow');$('#spotlights').innerHTML=`<article class="spotlight"><img class="spotlight-bg" src="/assets/liquid-glass.webp" alt=""><div><span class="eyebrow">EDITOR'S PICK / 01</span><h2>Afterglow</h2><p>NEON / 霓虹 · 日落之后，声音仍在流动。</p><button class="primary-button" data-play-track="afterglow">${icon('play')}即刻聆听</button></div><span class="spotlight-note">ELECTRONIC / DREAMY</span></article><div class="spotlight-mix"><div class="mix-heading"><h2>本周循环榜</h2><span>社区示例 / TOP 3</span></div>${tracks.slice().sort((a,b)=>b.likes-a.likes).slice(0,3).map((t,i)=>`<button class="mini-track" data-play-track="${t.id}" aria-label="播放榜单歌曲 ${esc(t.title)}"><span class="mini-rank">0${i+1}</span><img decoding="async" src="${artworkURL(t.art)}" alt=""><span class="mini-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><span class="mini-time">${time(t.duration)}</span>${icon('play')}</button>`).join('')}</div>`;}
function renderSongs(){const list=filteredTracks();$('#song-grid').innerHTML=list.map(songCard).join('');$('#results-empty').hidden=!!list.length;$('#result-count').textContent=`${list.length} 首作品`;const active=query||genre!=='all'||creatorFilter;$('#reset-filters').hidden=!active;$('#active-filter').hidden=!active;$('#active-filter').innerHTML=active?`${esc([query?`搜索「${query}」`:null,genre!=='all'?genres.find(g=>g.id===genre)?.name:null,creatorFilter?creators.find(c=>c.id===creatorFilter)?.name:null].filter(Boolean).join(' · '))}<button data-reset aria-label="清除搜索与筛选">${icon('close')}</button>`:'';$('#spotlights').hidden=!!active||recommend==='following';$$('[data-recommend]').forEach(b=>{const active=b.dataset.recommend===recommend;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});$$('[data-genre]').forEach(b=>b.setAttribute('aria-pressed',String(genre===b.dataset.genre)));if(recommend==='following'&&!list.length&&!query&&!creatorFilter&&genre==='all'){$('#results-empty h3').textContent='你关注的声音，会出现在这里';$('#results-empty p').textContent='从下方关注一位创作者，开始你的私人音乐发现。';}else{$('#results-empty h3').textContent='还没有找到这段旋律';$('#results-empty p').textContent='试试其他关键词，或清除当前筛选。';}}
function renderGenres(){$('#genre-grid').innerHTML=genres.map(g=>`<button class="genre-card" data-genre="${g.id}" aria-pressed="${genre===g.id}"><img decoding="async" src="${artworkURL(g.art)}" alt="" loading="lazy"><strong>${g.name}</strong><small>${g.subtitle}</small></button>`).join('');}
function creatorAvatar(c){return `<span class="creator-avatar"><img decoding="async" src="${artworkURL(c.art)}" alt="">${esc(c.initial)}</span>`;}
function followButton(c){return `<button class="follow-button" data-follow="${c.id}" aria-label="${social.follows.includes(c.id)?'取消关注':'关注'} ${esc(c.name)}" aria-pressed="${social.follows.includes(c.id)}">${social.follows.includes(c.id)?'已关注':'关注'}</button>`;}
function renderCreators(){$('#creator-grid').innerHTML=creators.map(c=>`<article class="creator-card glass">${creatorAvatar(c)}<div class="creator-info"><button data-creator="${c.id}">${esc(c.name)}</button><small>${c.genre} · ${c.followers} 关注者</small></div>${followButton(c)}<p class="creator-bio">${esc(c.description)}</p></article>`).join('');}
function renderCollection(){const albums=workspace.albums;$('#album-filters').innerHTML=`<button class="album-filter" data-album-filter="liked" aria-pressed="${albumFilter==='liked'}">${icon('heart')}<span><strong>喜欢的歌曲</strong><small>${workspace.liked.filter(trackById).length} 首作品</small></span></button>${albums.map(a=>`<button class="album-filter" data-album-filter="${esc(a.id)}" aria-pressed="${albumFilter===a.id}"><img decoding="async" src="${artworkURL(['forest.jpg','coast.jpg','mountains.jpg','liquid-glass.png'].includes(a.art)?a.art:'liquid-glass.png')}" alt=""><span><strong>${esc(a.title)}</strong><small>${a.tracks?.length||0} 首作品</small></span></button>`).join('')}`;const ids=albumFilter==='liked'?workspace.liked:albums.find(a=>a.id===albumFilter)?.tracks||[];const list=ids.map(trackById).filter(Boolean).filter(t=>`${t.title} ${t.artist} ${t.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));$('#collection-songs').innerHTML=list.map(songCard).join('');$('#collection-empty').hidden=!!list.length;}
function toggleCollection(next){collection=next;$('#discover-view').hidden=next;$('#collection-view').hidden=!next;$('#collection-entry').setAttribute('aria-pressed',String(next));if(next)renderCollection();}
function resetFilters(){query='';genre='all';creatorFilter=null;if(recommend==='following'&&!social.follows.length)recommend='best';$('#music-search').value='';syncSearchURL();renderSongs();if(collection)renderCollection();}
function setPlayerTab(next) {
  const panes={lyrics:'player-lyrics-view',about:'player-about',comments:'player-comments',queue:'player-queue'};
  if (!panes[next]) return;
  playerTab=next;
  $$('[data-player-tab]').forEach(button=>{const selected=button.dataset.playerTab===next;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  Object.entries(panes).forEach(([tab,id])=>$('#'+id).hidden=tab!==next);
  if(next!=='lyrics') { $('#immersive-player').classList.remove('is-focused'); $('#player-focus').setAttribute('aria-pressed','false'); $('#focus-label').textContent='专注歌词'; }
  else immersiveLyrics.reveal(true);
}
function position(){if(current.audioURL&&nativeAudio.getAttribute('src')===current.audioURL)return nativeAudio.currentTime;return Math.min(current.duration,elapsed+(playing?(performance.now()-startedAt)/1000:0));}
function pause(){elapsed=position();playing=false;operation++;sound.stop();nativeAudio.pause();syncPlayback();}
function seekTo(seconds) { const resume=playing;pause();elapsed=Math.max(0,Math.min(current.duration,seconds));if(current.audioURL&&nativeAudio.getAttribute('src'))nativeAudio.currentTime=elapsed;updateProgress();if(resume)playTrack(current.id); }
async function playTrack(id,{toggle=false,pool=null}={}){const t=trackById(id);if(!t)return;if(toggle&&t.id===current.id&&playing){pause();return;}if(t.id===current.id&&playing)return;const ticket=++operation;if(pool?.length)queue=pool;if(t.id!==current.id){sound.stop();nativeAudio.pause();nativeAudio.removeAttribute('src');elapsed=0;current=t;$('#comment-input').value='';}playing=false;syncPlayback();try{if(current.audioURL){sound.stop();if(nativeAudio.getAttribute('src')!==current.audioURL)nativeAudio.src=current.audioURL;nativeAudio.currentTime=elapsed;await nativeAudio.play();if(ticket!==operation){if(!current.audioURL)nativeAudio.pause();return;}}else{nativeAudio.pause();const started=await sound.start(current,elapsed);if(ticket!==operation||!started)return;}playing=true;startedAt=performance.now();syncPlayback();}catch{if(ticket===operation){playing=false;syncPlayback();toast('音频暂时无法播放，请重试。');}}}
function activePool(){if(collection){const ids=albumFilter==='liked'?workspace.liked:workspace.albums.find(a=>a.id===albumFilter)?.tracks||[];return ids.filter(trackById);}return filteredTracks().map(t=>t.id);}
function nextTrack(direction=1){const pool=queue.filter(trackById);if(!pool.length)return;const index=pool.indexOf(current.id);let next=(index+direction+pool.length)%pool.length;if(shuffled&&pool.length>1){const choices=pool.filter(id=>id!==current.id);next=pool.indexOf(choices[Math.floor(Math.random()*choices.length)]);}elapsed=0;if(pool[next]===current.id){pause();elapsed=0;}playTrack(pool[next]);}
function syncPlayback(){playbackClock.setPlaying(playing);document.body.classList.toggle('playing',playing);$('#dock-title').textContent=current.title;$('#dock-artist').textContent=current.artist+(current.published?' · 已发布单曲':' · 演示音轨');$('#dock-cover').src=artworkURL(current.art);$('#dock-cover').alt=current.title+' 封面';$$('[data-toggle-play]').forEach(b=>{b.innerHTML=icon(playing?'pause':'play');b.setAttribute('aria-label',playing?'暂停':'播放');});$$('[data-duration]').forEach(el=>el.textContent=time(current.duration));$$('[data-seek]').forEach(el=>el.max=current.duration);$$('[data-current-like]').forEach(b=>b.setAttribute('aria-pressed',String(workspace.liked.includes(current.id))));$$('[data-track]').forEach(card=>{const active=playing&&card.dataset.track===current.id;card.classList.toggle('is-playing',active);const b=card.querySelector('[data-play-track]');b.setAttribute('aria-label',`${active?'正在播放':'播放'} ${trackById(card.dataset.track).title}`);b.querySelector('.art-play').innerHTML=icon(active?'pause':'play');});$('#listening-status').textContent=playing?'正在聆听':'已暂停';if($('#immersive-player').open)renderPlayer();updateProgress();}
function updateProgress() {
  const value=position();
  $$('[data-elapsed]').forEach(el=>el.textContent=time(value));
  if(!seekDragging) {
    $$('[data-seek]').forEach(el=>{el.value=value;el.style.setProperty('--progress',value/current.duration*100+'%');el.setAttribute('aria-valuetext',time(value)+' / '+time(current.duration));});
    if($('#immersive-player').open)immersiveLyrics.update(current,value);
    dockLyrics.update(current,playing,value);
  }
}
function renderPlayer() {
  $('#immersive-player .demo-label').textContent=current.published?'已发布单曲':'器乐演示';
  $('#immersive-art .cover-lettering small').textContent=current.published?'SANZO / SINGLE':'SANZO / ORIGINAL DEMO';
  $('.listening-state small').textContent=current.published?'ORIGINAL SINGLE':'INSTRUMENTAL DEMO';
  $('#download-song small').textContent=current.audioURL?'MP3 · 原始音频':'WAV · 演示音频';
  $('#immersive-title').textContent=current.title;
  $('#focus-track-title').textContent=current.title;
  $('#immersive-cover').src=artworkURL(current.art);
  $('#immersive-cover').alt=current.title+' 封面';
  $('#immersive-caption').textContent=current.caption;
  $('#immersive-art').className='immersive-art cover-'+current.cover;
  $('#player-wash-art').src=artworkURL(current.art);
  $('#immersive-player').style.setProperty('--player-accent',/^#[0-9a-f]{6}$/i.test(current.accent)?current.accent:'#638eb5');
  const creator=creators.find(item=>item.id===current.creator);
  $('#player-creator').innerHTML=creatorAvatar(creator)+'<strong>'+esc(creator.name)+'</strong>'+followButton(creator);
  $('#player-style').innerHTML=current.tags.map((tag,i)=>'<span class="'+(i===0?'main-style':'')+'">'+esc(tag)+'</span>').join('');
  updateAlbumLabel();
  $('#download-lyrics').disabled=!lyricsFile(current);
  $('#player-about').innerHTML='<p class="about-copy">'+esc(current.prompt)+'</p><div class="about-tags">'+current.tags.map(tag=>'<span>'+esc(tag)+'</span>').join('')+'</div><div class="about-details"><div>'+(current.published?'生成模型':'演示模型')+'<strong>'+esc(current.model)+'</strong></div><div>'+(current.published?'播放次数':'示例热度')+'<strong>'+count(current.plays)+' 次播放</strong></div><div>时长<strong>'+time(current.duration)+'</strong></div></div><p class="about-note">'+(current.published?'创作者发布的原创单曲。':'合成纯音乐演示 · 封面与介绍为原型内容。')+'</p>';
  immersiveLyrics.update(current,position());renderComments();renderQueue();
}
function renderQueue(){const ids=queue.filter(trackById);$('#queue-count').textContent=`${ids.length} 首 · ${shuffled?'随机播放':repeating?'单曲循环':'顺序播放'}`;$('#queue-list').innerHTML=ids.map((id,i)=>{const t=trackById(id);return `<button class="queue-track ${id===current.id?'is-current':''}" data-queue-track="${id}" aria-label="播放队列歌曲 ${esc(t.title)}"><span>${id===current.id?icon('play'):String(i+1).padStart(2,'0')}</span><img decoding="async" src="${artworkURL(t.art)}" alt=""><span class="queue-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><span class="queue-time">${time(t.duration)}</span></button>`;}).join('');}
function renderComments(){const list=social.comments[current.id]||[];$('#comment-count').textContent=list.length;$('#comment-list').innerHTML=list.length?list.map(c=>`<article class="comment"><span class="comment-avatar">S</span><div><div class="comment-author"><strong>Sanzo Creator</strong><small>我的评论 · 本地保存</small></div><p>${esc(c.text)}</p></div></article>`).join(''):'<div class="player-empty">'+icon('comment')+'<h3>还没有听后感</h3><p>留下一句，为这段旋律添一点回响。</p></div>';}
function openPlayer(tab='lyrics') {
  renderPlayer();setPlayerTab(tab);
  const dialog=$('#immersive-player');
  if(!dialog.open)dialog.showModal();
  if(tab==='lyrics')immersiveLyrics.reveal(true);
  (tab==='comments'?$('#comment-input'):dialog.querySelector('[data-toggle-play]')).focus({preventScroll:true});
}
function likeTrack(id){workspace.liked=workspace.liked.includes(id)?workspace.liked.filter(x=>x!==id):[...workspace.liked,id];saveWorkspace();$$(`[data-like="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(workspace.liked.includes(id)));b.setAttribute('aria-label',`${workspace.liked.includes(id)?'取消收藏':'收藏'} ${trackById(id).title}`);});$$('[data-current-like]').forEach(b=>b.setAttribute('aria-pressed',String(workspace.liked.includes(current.id))));if(collection)renderCollection();}
function updateAlbumLabel(){const total=workspace.albums.filter(a=>a.tracks?.includes(current.id)).length;$('#player-album-status').textContent=total?'已加入 '+total+' 张专辑':'选择或新建专辑';}
let downloadBusy=false;
$('#download-song').addEventListener('click',async()=>{
  if(downloadBusy)return;downloadBusy=true;const track={...current};const button=$('#download-song');
  button.disabled=true;button.setAttribute('aria-busy','true');$('#song-download-label').textContent='准备音频…';
  try{if(track.audioURL){const response=await fetch(track.audioURL,{credentials:'same-origin'});if(!response.ok)throw Error();saveDownload(await response.blob(),downloadName(track.title)+'.mp3');toast('已下载「'+track.title+'」。');}else{saveDownload(await songFile(track),downloadName(track.title)+'-SANZO-demo.wav');toast('已准备「'+track.title+'」的 WAV 演示音频。');}}
  catch{toast('此浏览器暂时无法导出音频，请使用支持 Web Audio 的浏览器重试。');}
  finally{downloadBusy=false;button.disabled=false;button.removeAttribute('aria-busy');$('#song-download-label').textContent='下载歌曲';}
});
$('#download-lyrics').addEventListener('click',()=>{const text=lyricsFile(current);if(!text)return;saveDownload(new Blob([text],{type:'text/plain;charset=utf-8'}),downloadName(current.title)+'.lrc');toast('已下载歌词；无同步标记时，时间为估算。');});
// Stage album changes until the user saves; closing the chooser discards them.
let collectId=null,selectedAlbums=new Set(),stagedAlbums=[];
function renderAlbumChoices(){
 $('#album-empty').hidden=!!stagedAlbums.length;
 $('#save-collection').disabled=!stagedAlbums.length;
 $('#save-collection').textContent=selectedAlbums.size?'添加到 '+selectedAlbums.size+' 张专辑':'保存专辑选择';
 $('#album-choices').innerHTML=stagedAlbums.map(a=>`<label class="album-choice"><img decoding="async" src="${artworkURL(['forest.jpg','coast.jpg','mountains.jpg','liquid-glass.png'].includes(a.art)?a.art:'liquid-glass.png')}" alt=""><span>${esc(a.title)}<small>${a.tracks?.length||0} 首作品</small></span><input type="checkbox" data-album-choice="${esc(a.id)}" ${selectedAlbums.has(a.id)?'checked':''} aria-label="添加到 ${esc(a.title)}"></label>`).join('');
}
function openCollection(id){collectId=id;stagedAlbums=workspace.albums.map(a=>({...a,tracks:[...(a.tracks||[])]}));selectedAlbums=new Set(stagedAlbums.filter(a=>a.tracks.includes(id)).map(a=>a.id));$('#collect-song-name').textContent='「'+trackById(id).title+'」 · '+trackById(id).artist;renderAlbumChoices();$('#new-album-name').value='';$('#album-dialog').showModal();if(!stagedAlbums.length)$('#new-album-name').focus();}

let singleClickTimer;
function syncSearchURL(){const url=new URL(location.href);if(query.trim())url.searchParams.set('q',query.trim());else url.searchParams.delete('q');history.replaceState(null,'',url.pathname+url.search+url.hash);}
$('#search-form').addEventListener('submit',e=>e.preventDefault());$('#music-search').addEventListener('input',e=>{query=e.target.value;syncSearchURL();renderSongs();if(collection)renderCollection();});
$('#collection-entry').addEventListener('click',()=>toggleCollection(!collection));$('#back-discover').addEventListener('click',()=>toggleCollection(false));$('#reset-filters').addEventListener('click',resetFilters);$('#all-genres').addEventListener('click',()=>{genre='all';renderSongs();});
$('#close-player').addEventListener('click',()=>$('#immersive-player').close());$('#close-album').addEventListener('click',()=>$('#album-dialog').close());
$('#player-focus').addEventListener('click',()=>{const focused=!$('#immersive-player').classList.contains('is-focused');setPlayerTab('lyrics');$('#immersive-player').classList.toggle('is-focused',focused);$('#player-focus').setAttribute('aria-pressed',String(focused));$('#focus-label').textContent=focused?'退出专注':'专注歌词';immersiveLyrics.reveal(true);});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-play-track')){if(e.detail>1)return;clearTimeout(singleClickTimer);if(playing&&current.id===b.dataset.playTrack){if(e.detail===0)pause();else singleClickTimer=setTimeout(pause,260);}else playTrack(b.dataset.playTrack,{pool:activePool()});}if(b.hasAttribute('data-queue-track'))playTrack(b.dataset.queueTrack);if(b.hasAttribute('data-like'))likeTrack(b.dataset.like);if(b.hasAttribute('data-current-like'))likeTrack(current.id);if(b.hasAttribute('data-collect'))openCollection(b.dataset.collect);if(b.hasAttribute('data-current-collect'))openCollection(current.id);if(b.hasAttribute('data-comments')){if(current.id!==b.dataset.comments){pause();current=trackById(b.dataset.comments);elapsed=0;syncPlayback();}openPlayer('comments');}if(b.hasAttribute('data-open-player'))openPlayer();if(b.hasAttribute('data-open-queue'))openPlayer('queue');if(b.hasAttribute('data-toggle-play'))playing?pause():playTrack(current.id);if(b.hasAttribute('data-prev'))nextTrack(-1);if(b.hasAttribute('data-next'))nextTrack();if(b.hasAttribute('data-player-tab'))setPlayerTab(b.dataset.playerTab);if(b.hasAttribute('data-recommend')){recommend=b.dataset.recommend;renderSongs();}if(b.hasAttribute('data-genre')){genre=b.dataset.genre;creatorFilter=null;toggleCollection(false);renderSongs();$('#recommend-title').scrollIntoView({block:'start',behavior:'smooth'});}if(b.hasAttribute('data-creator')){creatorFilter=b.dataset.creator;genre='all';query='';$('#music-search').value='';syncSearchURL();recommend='best';toggleCollection(false);renderSongs();$('#recommend-title').scrollIntoView({block:'start',behavior:'smooth'});}if(b.hasAttribute('data-follow')){const id=b.dataset.follow;social.follows=social.follows.includes(id)?social.follows.filter(x=>x!==id):[...social.follows,id];saveSocial();renderCreators();if($('#immersive-player').open){const c=creators.find(x=>x.id===current.creator);$('#player-creator').innerHTML=`${creatorAvatar(c)}<strong>${esc(c.name)}</strong>${followButton(c)}`;}if(recommend==='following')renderSongs();}if(b.hasAttribute('data-album-filter')){albumFilter=b.dataset.albumFilter;renderCollection();}if(b.hasAttribute('data-reset'))resetFilters();if(b.hasAttribute('data-discover'))toggleCollection(false);if(b.hasAttribute('data-shuffle')){shuffled=!shuffled;$$('[data-shuffle]').forEach(el=>el.setAttribute('aria-pressed',String(shuffled)));renderQueue();}if(b.hasAttribute('data-repeat')){repeating=!repeating;$$('[data-repeat]').forEach(el=>el.setAttribute('aria-pressed',String(repeating)));renderQueue();}if(b.hasAttribute('data-mute'))setVolume(volume===0?lastVolume||55:0);});
document.addEventListener('dblclick',e=>{const b=e.target.closest('[data-play-track]');if(b){clearTimeout(singleClickTimer);playTrack(b.dataset.playTrack,{pool:activePool()});openPlayer();}});
$$('[data-seek]').forEach(input=>{input.addEventListener('input',()=>{seekDragging=true;const value=Number(input.value);input.style.setProperty('--progress',`${value/current.duration*100}%`);input.setAttribute('aria-valuetext',`${time(value)} / ${time(current.duration)}`);$$('[data-elapsed]').forEach(el=>el.textContent=time(value));});input.addEventListener('change',()=>{const resume=playing;pause();elapsed=Math.min(current.duration,Number(input.value));seekDragging=false;updateProgress();if(resume)playTrack(current.id);});input.addEventListener('blur',()=>{seekDragging=false;});});
function setVolume(value){if(volume>0)lastVolume=volume;volume=Number(value);sound.setVolume(volume/100);nativeAudio.volume=volume/100;$$('[data-volume]').forEach(el=>{el.value=volume;el.style.setProperty('--progress',volume+'%');});$$('[data-mute]').forEach(el=>{el.innerHTML=icon(volume===0?'mute':'volume');el.setAttribute('aria-label',volume===0?'取消静音':'静音');});}
$$('[data-volume]').forEach(el=>el.addEventListener('input',()=>setVolume(el.value)));
$('#comment-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#comment-input');const text=input.value.trim();if(!text){input.focus();return;}const list=Array.isArray(social.comments[current.id])?social.comments[current.id]:[];social.comments[current.id]=[...list,{id:crypto.randomUUID(),text:text.slice(0,500),created:Date.now()}].slice(-100);saveSocial();input.value='';renderComments();toast('评论已保存在当前浏览器。');});
$('#album-choices').addEventListener('change',e=>{const id=e.target.dataset.albumChoice;if(!id)return;e.target.checked?selectedAlbums.add(id):selectedAlbums.delete(id);$('#save-collection').textContent=selectedAlbums.size?'添加到 '+selectedAlbums.size+' 张专辑':'保存专辑选择';});
$('#new-album-form').addEventListener('submit',e=>{
 e.preventDefault();const input=$('#new-album-name'),title=input.value.trim();if(!title){input.value='';input.reportValidity();return;}
 const a={id:'album-'+crypto.randomUUID(),title:title.slice(0,60),description:'从探索音乐收藏的声音。',art:trackById(collectId).art,tracks:[collectId],updated:'刚刚创建'};
 workspace.albums=[a,...workspace.albums];saveWorkspace();updateAlbumLabel();if(collection)renderCollection();$('#album-dialog').close();toast('已创建「'+a.title+'」，并加入当前歌曲。');
});
$('#save-collection').addEventListener('click',()=>{stagedAlbums.forEach(a=>{const ids=Array.isArray(a.tracks)?a.tracks:[];const selected=selectedAlbums.has(a.id),exists=ids.includes(collectId);if(selected&&!exists)a.tracks=[...ids,collectId];else if(!selected&&exists)a.tracks=ids.filter(id=>id!==collectId);if(selected!==exists)a.updated='刚刚编辑';});workspace.albums=stagedAlbums;saveWorkspace();updateAlbumLabel();if(collection)renderCollection();$('#album-dialog').close();toast(selectedAlbums.size?'已添加到 '+selectedAlbums.size+' 张专辑。':'专辑选择已更新。');});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='/'&&!$('dialog[open]')){e.preventDefault();$('#music-search').focus();}if(e.code==='Space'&&e.target===document.body){e.preventDefault();playing?pause():playTrack(current.id);}});
$$('[role=tablist]').forEach(group=>group.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...group.querySelectorAll('[role=tab]')];const index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();}));
window.addEventListener('sanzo-cloud-update',e=>{if(e.detail.namespace==='workspace'){workspace=e.detail.data;workspace.albums=Array.isArray(workspace.albums)?workspace.albums:defaultAlbums();workspace.liked=Array.isArray(workspace.liked)?workspace.liked:[];renderSongs();if(collection)renderCollection();syncPlayback();}if(e.detail.namespace==='explore'){social=e.detail.data;social.follows=Array.isArray(social.follows)?social.follows:[];social.comments=social.comments||{};renderCreators();renderSongs();if($('#immersive-player').open)renderPlayer();}});
function tickPlayback(){if(playing&&position()>=current.duration){pause();elapsed=0;if(repeating)playTrack(current.id);else nextTrack();}else updateProgress();}
window.addEventListener('pagehide',e=>{clearTimeout(singleClickTimer);pause();if(!e.persisted){playbackClock.destroy();dockLyrics.destroy();}});
$('#music-search').value=query;
renderSpotlights();renderGenres();renderCreators();renderSongs();syncPlayback();initWorkspaceMotion();

nativeAudio.addEventListener('loadedmetadata',()=>{if(current.audioURL&&Number.isFinite(nativeAudio.duration)){current.duration=nativeAudio.duration;syncPlayback();}});
nativeAudio.addEventListener('error',()=>{if(current.audioURL){pause();toast('歌曲暂时无法读取，请稍后重试。');}});
let releasesLoading=false;
async function refreshReleasedMusic(){
 if(releasesLoading)return;releasesLoading=true;
 try{
  const published=await loadPublishedTracks();
  tracks.splice(0,tracks.length,...published,...demoTracks);
  for(const t of published)if(!creators.some(c=>c.id===t.creator))creators.push({id:t.creator,name:t.artist,initial:t.artist.slice(0,1),art:t.art,description:'分享自己的音乐作品。',genre:t.tags[0]||'原创音乐',followers:'—',tracks:published.filter(p=>p.creator===t.creator).length});
  queue=queue.filter(trackById);for(const t of published)if(!queue.includes(t.id))queue.push(t.id);
  if(current.published&&!trackById(current.id)){pause();elapsed=0;current=demoTracks[0];syncPlayback();}
  renderSongs();renderCreators();if(collection)renderCollection();
 }catch(error){toast(error.message);}finally{releasesLoading=false;}
}
refreshReleasedMusic();window.addEventListener('focus',refreshReleasedMusic);window.addEventListener('pageshow',refreshReleasedMusic);
