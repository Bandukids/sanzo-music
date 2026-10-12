const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const tracks = [
 {id:'blue',title:'Blue Hour',artist:'Luna Waves',style:'chill',tags:['Chill','Electronic'],art:'forest.jpg',cover:'forest',coverTitle:'blue<br>hour.',plays:'12.8k',duration:204},
 {id:'afterglow',title:'Afterglow',artist:'NEON / 霓虹',style:'electronic',tags:['Electronic','Dreamy'],art:'liquid-glass.png',cover:'glass',coverTitle:'AFTER<br>GLOW',plays:'8.6k',duration:186},
 {id:'deep',title:'深海失重',artist:'南屿',style:'ambient',tags:['Ambient','Atmospheric'],art:'coast.jpg',cover:'deep',coverTitle:'深 海 失 重',plays:'6.2k',duration:232},
 {id:'sunset',title:'Sunset Boulevard',artist:'Oliver Chen',style:'pop',tags:['Indie Pop','Warm'],art:'coast.jpg',cover:'sunset',coverTitle:'Sunset<br>Boulevard',plays:'10.4k',duration:198},
 {id:'jazz',title:'Midnight in Paris',artist:'J. Laurent',style:'jazz',tags:['Jazz','Late Night'],art:'forest.jpg',cover:'jazz',coverTitle:'Midnight<br>in Paris',plays:'4.9k',duration:218},
 {id:'dream',title:'星河入梦',artist:'Echo Studio',style:'cinematic',tags:['Cinematic','Dreamy'],art:'mountains.jpg',cover:'dream',coverTitle:'星河<br>入梦',plays:'7.3k',duration:245}
];
const formatTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const styleNames = {electronic:'Electronic',pop:'Indie Pop',chill:'Chill',ambient:'Ambient',jazz:'Jazz',cinematic:'Cinematic'};
let saved = {};
try { saved = JSON.parse(localStorage.getItem('sanzo-studio-v1') || '{}'); } catch {}
const creations = Array.isArray(saved.creations) ? saved.creations.filter(t=>t && typeof t.id==='string' && t.id.startsWith('created-') && typeof t.title==='string' && styleNames[t.style]).slice(0,50).map(t=>({...t,artist:'Sanzo Creator',art:'liquid-glass.png',cover:'glass',coverTitle:escapeHtml(t.title.slice(0,16)),tags:[styleNames[t.style],'Original'],plays:'新作品',duration:180,generated:true})) : [];
tracks.unshift(...creations);
let liked = new Set(Array.isArray(saved.liked) ? saved.liked.filter(id=>tracks.some(t=>t.id===id)) : ['blue','deep','sunset']);
let credits = Number.isFinite(saved.credits) && saved.credits>=0 ? saved.credits : 120;
let page='discover', filter='all', query='', showAll=false, current=tracks.find(t=>t.id==='blue'), playing=false, elapsed=0, startedAt=0, shuffled=false, repeating=false, generationBusy=false;
function persist(){try{localStorage.setItem('sanzo-studio-v1',JSON.stringify({liked:[...liked],credits,creations:tracks.filter(t=>t.generated).slice(0,50)}));}catch{toast('浏览器存储已满，本次作品在页面关闭前可试听');}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function listTracks(){return tracks.filter(t=>(page!=='library'||t.generated)&&(page!=='favorites'||liked.has(t.id))&&(filter==='all'||t.style===filter)&&(t.title+' '+t.artist+' '+t.tags.join(' ')).toLowerCase().includes(query.toLowerCase()));}
function renderTracks(){
 const filtered=listTracks();
 $('#tracks').innerHTML=filtered.map((t,i)=>`<article class="track-card ${playing&&current.id===t.id?'is-playing':''}" data-id="${escapeHtml(t.id)}" style="--card-index:${i}"><div class="track-art cover-${t.cover}"><img src="/assets/${t.art}" alt="${escapeHtml(t.title)} 专辑封面" loading="lazy"><div class="track-cover-text"><small>${t.generated?'YOUR ORIGINAL':'SANZO ORIGINAL'}</small>${t.coverTitle}</div><span class="track-duration">${formatTime(t.duration)}</span><span class="track-count">${icon('headphones')}${t.plays}</span><button class="cover-play" data-play="${escapeHtml(t.id)}" aria-label="${playing&&current.id===t.id?'暂停':'播放'} ${escapeHtml(t.title)}">${icon(playing&&current.id===t.id?'pause':'play')}</button></div><div class="track-info"><div class="track-title-row"><h3>${escapeHtml(t.title)}</h3><button class="track-heart ${liked.has(t.id)?'liked':''}" data-like="${escapeHtml(t.id)}" aria-label="${liked.has(t.id)?'取消收藏':'收藏'} ${escapeHtml(t.title)}" aria-pressed="${liked.has(t.id)}">${icon('heart')}</button></div><span class="track-artist">${escapeHtml(t.artist)}</span><div class="track-tags">${t.tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div></div></article>`).join('');
 $('#empty-state').hidden=filtered.length>0;
 $('#empty-state h3').textContent=query?'没有找到这段旋律':page==='favorites'?'把心动的音乐，收藏在这里':'这里，还等着你的第一首音乐';
 $('#empty-state p').textContent=query?'试试其他歌曲名、创作者或音乐风格。':'从一个念头开始，收藏或创作你的声音。';
 $('.favorite-count').textContent=liked.size;$('#credit-count').textContent=credits;
 $('#tracks').classList.toggle('show-all',showAll||page!=='discover'||filter!=='all'||!!query);
 $('#view-all').textContent=showAll?'收起推荐':'探索全部';
 updatePlayer();
}
function navigate(next){
 if(next==='create'){openCreator();return;}
 if(!['discover','library','favorites'].includes(next))return;
 page=next;filter='all';query='';$('#search').value='';
 $$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
 const discovery=page==='discover';
 $('#discover-hero').hidden=!discovery;$('#quick-create').hidden=!discovery;$('#lower-section').hidden=!discovery;
 $('#page-label').textContent={discover:'发现',library:'音乐库',favorites:'喜欢'}[page];
 $('#page-subtitle').textContent={discover:'你的下一首心动之作',library:'每一个灵感，都有回响',favorites:'让心动的旋律再次响起'}[page];
 $('#section-kicker').textContent={discover:'CURATED FOR YOU',library:'MADE BY YOU',favorites:'CLOSE TO YOUR HEART'}[page];
 $('#section-title').innerHTML={discover:'为你发现 <span>好音乐，刚刚好。</span>',library:'我的音乐库 <span>记录每一次灵感。</span>',favorites:'喜欢的音乐 <span>你与音乐的私人默契。</span>'}[page];
 $('#view-all').hidden=!discovery;document.body.classList.toggle('collection-view',!discovery);
 $$('.filter').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',b.dataset.filter===filter);});
 $('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});renderTracks();
}
function toggleLike(id){if(liked.has(id))liked.delete(id);else liked.add(id);persist();renderTracks();}
function setFilter(next){filter=next;$$('.filter').forEach(b=>{b.classList.toggle('active',b.dataset.filter===next);b.setAttribute('aria-pressed',b.dataset.filter===next);});renderTracks();}
function updatePlayer(){
 $('#player-title').textContent=current.title;$('#player-artist').textContent=current.artist+' · '+current.tags.join(' ');
 $('#player-cover').style.backgroundImage=`url('/assets/${current.art}')`;$('#player-cover').className='player-cover cover-'+current.cover;
 $('#player-cover').style.filter=current.cover==='forest'?'hue-rotate(150deg) saturate(.6)':current.cover==='deep'?'hue-rotate(160deg) saturate(.6)':'none';
 $('#player-like').classList.toggle('liked',liked.has(current.id));$('#player-like').setAttribute('aria-pressed',liked.has(current.id));
 $('#play').innerHTML=icon(playing?'pause':'play');$('#play').setAttribute('aria-label',playing?'暂停':'播放');$('#duration').textContent=formatTime(current.duration);document.body.classList.toggle('music-playing',playing);
}

// Browser-native demo soundtrack: pads, bass, melody and soft percussion.
// No external audio service or real AI music-generation request is made.
class SoundEngine{
 constructor(){this.context=null;this.voices=new Set();this.timer=null;this.level=.55;this.operation=0;}
 async start(track,offset=0){
  this.stop();const operation=this.operation;
  if(!this.context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw Error('audio-unavailable');this.context=new AudioContext();}
  const ctx=this.context;await ctx.resume();if(operation!==this.operation)return false;
  this.output=ctx.createGain();this.output.gain.value=this.level*.45;
  const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-20;compressor.ratio.value=4;this.output.connect(compressor);compressor.connect(ctx.destination);
  this.compressor=compressor;
  const delay=ctx.createDelay(1);delay.delayTime.value=.28;const feedback=ctx.createGain();feedback.gain.value=.2;const wet=ctx.createGain();wet.gain.value=.18;this.output.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(compressor);this.delayNodes=[delay,feedback,wet];
  const tempos={electronic:112,pop:100,chill:78,ambient:64,jazz:88,cinematic:72};this.style=track.style;this.stepDuration=60/(tempos[track.style]||90)/4;this.step=Math.floor(offset/this.stepDuration);this.next=ctx.currentTime+.07;
  this.root=track.id.split('').reduce((s,c)=>s+c.charCodeAt(0),0)%3===0?57:60;
  this.noise=ctx.createBuffer(1,ctx.sampleRate*.3,ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
  const tick=()=>{while(this.next<ctx.currentTime+.12){this.schedule(this.step,this.next);this.next+=this.stepDuration;this.step++;}};
  tick();this.timer=setInterval(tick,30);return true;
 }
 tone(midi,time,duration,volume=.1,type='sine'){
  const ctx=this.context;const osc=ctx.createOscillator();const gain=ctx.createGain();const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=this.style==='electronic'?2700:1700;osc.type=type;osc.frequency.value=440*Math.pow(2,(midi-69)/12);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.025);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(filter);filter.connect(gain);gain.connect(this.output);osc.start(time);osc.stop(time+duration+.05);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();filter.disconnect();gain.disconnect();};
 }
 kick(time){const ctx=this.context;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.setValueAtTime(135,time);osc.frequency.exponentialRampToValueAtTime(38,time+.16);gain.gain.setValueAtTime(.35,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.24);osc.connect(gain);gain.connect(this.output);osc.start(time);osc.stop(time+.26);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};}
 hit(time,snare=false){const ctx=this.context;const src=ctx.createBufferSource();src.buffer=this.noise;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=snare?1600:7000;const gain=ctx.createGain();gain.gain.setValueAtTime(snare?.16:.055,time);gain.gain.exponentialRampToValueAtTime(.0001,time+(snare?.13:.045));src.connect(filter);filter.connect(gain);gain.connect(this.output);src.start(time);src.stop(time+.17);this.voices.add(src);src.onended=()=>{this.voices.delete(src);src.disconnect();filter.disconnect();gain.disconnect();};}
 schedule(step,time){
  const beat=step%16;const bar=Math.floor(step/16)%4;const roots=[0,-5,-8,-3];const root=this.root+roots[bar];const chord=[root,root+3,root+7,root+10];const relaxed=['ambient','cinematic'].includes(this.style);
  if(beat===0){chord.forEach((n,i)=>this.tone(n+12,time+i*.015,this.stepDuration*19,.055,'triangle'));this.tone(root-12,time,this.stepDuration*12,.15,'sine');}
  if(!relaxed){if(beat%8===0||(this.style==='electronic'&&beat%4===0))this.kick(time);if(beat===4||beat===12)this.hit(time,true);if(beat%2===0)this.hit(time+.01);if(beat===8)this.tone(root-12,time,this.stepDuration*5,.12);}
  const sequence=[0,2,1,3,2,1,3,2];if(step%(relaxed?4:2)===0)this.tone(chord[sequence[Math.floor(step/2)%8]]+24,time+(beat%4===2?.018:0),this.stepDuration*(relaxed?7:3),relaxed?.065:.085,this.style==='electronic'?'triangle':'sine');
 }
 setVolume(level){this.level=level;if(this.output&&this.context)this.output.gain.setTargetAtTime(level*.45,this.context.currentTime,.03);}
 stop(){this.operation++;clearInterval(this.timer);this.timer=null;for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();if(this.output){try{this.output.disconnect();this.compressor.disconnect();this.delayNodes.forEach(n=>n.disconnect());}catch{}}}
}
const sound=new SoundEngine();
let audioOperation=0;
async function playTrack(id,forceToggle=true){
 const target=tracks.find(t=>t.id===id);if(!target)return;
 if(target.id===current.id&&playing&&forceToggle){pause();return;}
 const operation=++audioOperation;
 if(target.id!==current.id){elapsed=0;current=target;}
 try{const started=await sound.start(current,elapsed);if(operation!==audioOperation||!started)return;playing=true;startedAt=performance.now();renderTracks();}catch{playing=false;updatePlayer();toast('此浏览器暂时无法播放音频，请使用支持 Web Audio 的浏览器');}
}
function position(){return Math.min(current.duration,elapsed+(playing?(performance.now()-startedAt)/1000:0));}
function pause(){elapsed=position();playing=false;++audioOperation;sound.stop();renderTracks();}
function nextTrack(direction=1){const pool=listTracks().length?listTracks():tracks;const idx=pool.findIndex(t=>t.id===current.id);const next=shuffled?Math.floor(Math.random()*pool.length):(idx+direction+pool.length)%pool.length;elapsed=0;playTrack(pool[next].id,false);}
function updateTimeline(){
 const seconds=position();$('#current-time').textContent=formatTime(seconds);const percent=seconds/current.duration*100;$('#seek').value=percent;$('#seek').style.setProperty('--progress',percent+'%');
 if(playing&&seconds>=current.duration){elapsed=0;if(repeating)playTrack(current.id,false);else nextTrack();}
 requestAnimationFrame(updateTimeline);
}
$('#tracks').addEventListener('click',e=>{const play=e.target.closest('[data-play]');const heart=e.target.closest('[data-like]');if(play)playTrack(play.dataset.play);if(heart)toggleLike(heart.dataset.like);});
$('#play').addEventListener('click',()=>playing?pause():playTrack(current.id,false));$('#player-like').addEventListener('click',()=>toggleLike(current.id));
$('#prev').addEventListener('click',()=>nextTrack(-1));$('#next').addEventListener('click',()=>nextTrack());
$('#seek').addEventListener('input',e=>{elapsed=Number(e.target.value)/100*current.duration;if(playing){startedAt=performance.now();playTrack(current.id,false);}});
$('#volume').addEventListener('input',e=>{const value=Number(e.target.value);sound.setVolume(value/100);e.target.style.setProperty('--progress',value+'%');$('#mute').classList.toggle('muted',value===0);$('#mute').setAttribute('aria-label',value===0?'取消静音':'静音');});
let previousVolume=55;$('#mute').addEventListener('click',()=>{const range=$('#volume');if(Number(range.value)){previousVolume=Number(range.value);range.value=0;}else range.value=previousVolume;range.dispatchEvent(new Event('input'));});
$('#shuffle').addEventListener('click',e=>{shuffled=!shuffled;e.currentTarget.classList.toggle('enabled',shuffled);e.currentTarget.setAttribute('aria-pressed',shuffled);toast(shuffled?'随机播放已开启':'已恢复顺序播放');});
$('#repeat').addEventListener('click',e=>{repeating=!repeating;e.currentTarget.classList.toggle('enabled',repeating);e.currentTarget.setAttribute('aria-pressed',repeating);toast(repeating?'单曲循环已开启':'单曲循环已关闭');});
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
$('#search').addEventListener('input',e=>{query=e.target.value.trim();renderTracks();});
$('#view-all').addEventListener('click',()=>{showAll=!showAll;renderTracks();});
$$('[data-collection]').forEach(b=>b.addEventListener('click',()=>{navigate('discover');setFilter(b.dataset.collection);$('.music-section').scrollIntoView({behavior:'smooth',block:'start'});}));
$('#hero-listen').addEventListener('click',()=>playTrack('afterglow',false));
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));$('#mobile-shade').addEventListener('click',()=>$('#sidebar').classList.remove('open'));

function openCreator(prompt=''){
 if(prompt)$('#song-prompt').value=prompt;
 if(!$('#create-dialog').open)$('#create-dialog').showModal();
 if(!generationBusy)setTimeout(()=>$('#song-prompt').focus(),100);
}
$('#hero-create').addEventListener('click',()=>openCreator());$('#empty-create').addEventListener('click',()=>openCreator());$('#quick-generate').addEventListener('click',()=>openCreator($('#quick-prompt').value));
$('#quick-prompt').addEventListener('keydown',e=>{if(e.key==='Enter')openCreator(e.currentTarget.value);});
$('#close-create').addEventListener('click',()=>$('#create-dialog').close());
$$('[data-mode]').forEach(b=>{b.tabIndex=b.classList.contains('active')?0:-1;b.addEventListener('click',()=>{$$('[data-mode]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-selected',t===b);t.tabIndex=t===b?0:-1;});$('#custom-fields').hidden=b.dataset.mode!=='custom';});b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=$$('[data-mode]');const next=e.key==='Home'?tabs[0]:e.key==='End'?tabs[1]:tabs.find(t=>t!==b);next.click();next.focus();}});});
$$('[data-suggestion]').forEach(b=>b.addEventListener('click',()=>{$('#song-prompt').value=b.dataset.suggestion;$('#song-prompt').focus();}));
const inspirations=['清晨第一束阳光，轻快的独立流行，明亮的吉他，充满期待的一天','雨夜咖啡馆，温暖的爵士钢琴，轻柔的鼓点，安静而舒适','霓虹城市的午夜漫游，复古合成器，跳动的低音，自由而浪漫','漂浮在星河之中，空灵氛围音乐，悠长弦乐，像一场温柔的梦'];
let inspirationIndex=0;$('#inspire').addEventListener('click',()=>{$('#quick-prompt').value=inspirations[inspirationIndex++%inspirations.length];});
$$('[data-mood]').forEach(b=>b.addEventListener('click',()=>{const mood=b.dataset.mood;$('#song-style').value={夜晚:'chill',能量:'electronic',梦境:'ambient'}[mood];openCreator({夜晚:inspirations[1],能量:inspirations[2],梦境:inspirations[3]}[mood]);}));
async function generateDemo({prompt,title,style,instrumental=true,lyrics=''}){
 if(generationBusy)throw new Error('已有歌曲正在生成，请稍后再试');
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>500)throw new Error('请填写 1–500 字的音乐描述');
 if(!styleNames[style])throw new Error('请选择支持的音乐风格');
 if(typeof title!=='string'||title.length>40)throw new Error('歌曲名称最多 40 字');
 if(typeof lyrics!=='string'||lyrics.length>3000)throw new Error('歌词最多 3000 字');
 if(credits<10)throw new Error('灵感余额不足 10 点');
 generationBusy=true;$('#create-form').hidden=true;$('.creation-tabs').hidden=true;$('#generation-status').hidden=false;
 const stages=[['正在捕捉你的灵感','让情绪与旋律相遇…'],['正在编织声音','合成器、低音与节奏正在融合…'],['正在完成最后的细节','你的下一首音乐，即将诞生。']];
 await new Promise(resolve=>{let progress=0;const timer=setInterval(()=>{progress+=2;const stage=stages[Math.min(2,Math.floor(progress/36))];$('#generation-title').textContent=stage[0];$('#generation-description').textContent=stage[1];$('#generation-progress').style.width=progress+'%';$('#generation-percent').textContent=progress+'%';if(progress>=100){clearInterval(timer);resolve();}},85);});
 const finalTitle=title.trim()||{electronic:'霓虹回响',chill:'午夜来信',ambient:'漂浮的梦',jazz:'雨后圆舞曲',pop:'晴空未完',cinematic:'远方的星河'}[style];
 const track={id:'created-'+Date.now(),title:finalTitle,artist:'Sanzo Creator',style,tags:[styleNames[style],instrumental?'Instrumental':'Vocal concept'],art:'liquid-glass.png',cover:'glass',coverTitle:escapeHtml(finalTitle.slice(0,16)),plays:'新作品',duration:180,generated:true,prompt:prompt.trim(),lyrics,instrumental};
 tracks.unshift(track);credits-=10;persist();generationBusy=false;$('#create-dialog').close();$('#create-form').hidden=false;$('.creation-tabs').hidden=false;$('#generation-status').hidden=true;$('#generation-progress').style.width='0%';$('#generation-percent').textContent='0%';
 $('#song-title').value='';$('#quick-prompt').value='';navigate('library');toast('「'+finalTitle+'」已加入音乐库 · 演示音轨可试听');return{id:track.id,title:track.title,status:'demo-created',instrumentalAudio:true};
}
$('#create-form').addEventListener('submit',async e=>{e.preventDefault();try{await generateDemo({prompt:$('#song-prompt').value,title:$('#song-title').value,style:$('#song-style').value,instrumental:$('#instrumental').checked,lyrics:$('#song-lyrics').value});}catch(error){toast(error.message);}});
function showInfo(html){$('#info-content').innerHTML=html;if(!$('#info-dialog').open)$('#info-dialog').showModal();}
$('#close-info').addEventListener('click',()=>$('#info-dialog').close());
$('#upgrade').addEventListener('click',()=>showInfo(`<span class="section-kicker">SANZO PRO</span><h2>给创作，更多空间。</h2><p>探索更自由的音乐创作体验。</p><ul><li>✦ 更充足的创作额度</li><li>✦ 多种音色与精细风格控制</li><li>✦ 音轨分离与高品质导出</li></ul><p class="prototype-note">产品概念预览 · 订阅服务尚未开放</p><button class="primary-button" data-info-close>继续创作</button>`));
function showAccount(){showInfo(`<span class="section-kicker">YOUR CREATIVE SPACE</span><h2>你好，Sanzo Creator。</h2><p>已创作 ${tracks.filter(t=>t.generated).length} 首音乐 · 已收藏 ${liked.size} 首<br>当前灵感余额：${credits} 点</p><p>作品与收藏保存在此浏览器，随时回来，继续你的灵感。</p><button class="primary-button" data-info-close>回到我的空间</button>`);}
$('#account').addEventListener('click',showAccount);$('#profile').addEventListener('click',showAccount);
$('#notifications').addEventListener('click',()=>showInfo(`<span class="section-kicker">WHAT'S NEW</span><h2>欢迎来到 SANZO。</h2><p>你的创作空间已准备就绪。探索一段旋律，或者把脑海中的画面写下来。</p><p>你拥有 120 点初始灵感额度，每次演示创作使用 10 点。</p><button class="primary-button" data-info-create>开始我的创作</button>`));
$('#queue').addEventListener('click',()=>showInfo(`<span class="section-kicker">UP NEXT</span><h2>接下来听</h2><div class="queue-list">${(listTracks().length?listTracks():tracks).map(t=>`<button data-queue-play="${escapeHtml(t.id)}"><span>${escapeHtml(t.title)}</span><small>${escapeHtml(t.artist)}</small>${icon('play')}</button>`).join('')}</div>`));
$('#info-dialog').addEventListener('click',e=>{if(e.target.closest('[data-info-close]'))$('#info-dialog').close();if(e.target.closest('[data-info-create]')){$('#info-dialog').close();openCreator();}const button=e.target.closest('[data-queue-play]');if(button){playTrack(button.dataset.queuePlay,false);$('#info-dialog').close();}});
$$('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}}));
document.addEventListener('keydown',e=>{const typing=e.target.matches('input,textarea,select');if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCreator();}if(e.key==='/'&&!typing&&!$('dialog[open]')){e.preventDefault();$('#search').focus();}if(e.code==='Space'&&!typing&&!$('dialog[open]')&&e.target===document.body){e.preventDefault();playing?pause():playTrack(current.id,false);}});

// Decorative particles and pointer-reactive light; reduced-motion is respected.
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas=$('#ambient');const ctx=canvas.getContext('2d');let particles=[],width=0,height=0,lastFrame=0,pointer={x:-1000,y:-1000};
function resizeParticles(){width=innerWidth;height=innerHeight;canvas.width=width*Math.min(devicePixelRatio,1.5);canvas.height=height*Math.min(devicePixelRatio,1.5);ctx.setTransform(Math.min(devicePixelRatio,1.5),0,0,Math.min(devicePixelRatio,1.5),0,0);particles=Array.from({length:width<650?22:52},()=>({x:Math.random()*width,y:Math.random()*height,r:Math.random()*1.2+.3,speed:Math.random()*.13+.05,phase:Math.random()*6.28,warm:Math.random()>.76}));}
function animateParticles(now){if(now-lastFrame>32&&!document.hidden){lastFrame=now;ctx.clearRect(0,0,width,height);particles.forEach(p=>{if(!reduced.matches){p.y-=p.speed;if(p.y<0)p.y=height;p.x+=Math.sin(now*.00012+p.phase)*.07;}ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.warm?`rgba(255,163,91,${.12+Math.sin(now*.0006+p.phase)*.08})`:`rgba(140,182,250,${.14+Math.sin(now*.0004+p.phase)*.09})`;ctx.fill();const distance=Math.hypot(p.x-pointer.x,p.y-pointer.y);if(distance<110&&!reduced.matches){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(pointer.x,pointer.y);ctx.strokeStyle=`rgba(106,162,248,${(1-distance/110)*.1})`;ctx.lineWidth=.5;ctx.stroke();}});}requestAnimationFrame(animateParticles);}
resizeParticles();window.addEventListener('resize',resizeParticles);window.addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};});
$$('.glass').forEach(el=>{if(el.matches('.sidebar,dialog,.player'))return;el.addEventListener('pointermove',e=>{if(reduced.matches)return;const rect=el.getBoundingClientRect();el.style.setProperty('--light-x',(e.clientX-rect.left)+'px');el.style.setProperty('--light-y',(e.clientY-rect.top)+'px');});});
requestAnimationFrame(animateParticles);requestAnimationFrame(updateTimeline);renderTracks();

// Optional, feature-detected WebMCP tools use the same visible app actions.
if(document.modelContext?.registerTool){
 const lifetime=new AbortController();
 const tools=[
  {name:'list_music',title:'浏览音乐',description:'Read tracks currently visible in the SANZO music collection.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||Object.keys(input).length)throw Error('Expected an empty object');return{page,tracks:listTracks().map(t=>({id:t.id,title:t.title,style:t.style,liked:liked.has(t.id)}))};}},
  {name:'open_music_creator',title:'打开创作面板',description:'Open the music creation dialog and optionally stage a prompt. Does not generate a track.',inputSchema:{type:'object',properties:{prompt:{type:'string',maxLength:500}},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='prompt')||input.prompt!==undefined&&(typeof input.prompt!=='string'||input.prompt.length>500))throw Error('Invalid prompt');openCreator(input.prompt||'');return{status:'creator-open'};}},
  {name:'create_demo_music',title:'生成演示音乐',description:'Create a local instrumental demo track, spend 10 prototype credits, and save it in this browser. Simulates generation; not a real AI music service.',inputSchema:{type:'object',properties:{prompt:{type:'string',minLength:1,maxLength:500},title:{type:'string',maxLength:40},style:{type:'string',enum:Object.keys(styleNames)}},required:['prompt','style'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>!['prompt','title','style'].includes(k)))throw Error('Invalid input');return generateDemo({...input,title:input.title??''});}}
 ];
 tools.forEach(tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifetime.signal})).catch(()=>{});}catch{}});window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
}

if(location.hash==='#create')openCreator();
