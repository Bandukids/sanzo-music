import {initTrash} from '/creator-trash.js';
import {WOOSH_AVAILABLE} from '/service-availability.js';
import {creationTitle} from '/creation-title.js';
import {initUploads} from '/creator-uploads.js';
import { artworkURL, isSavedArtwork } from '/artwork.js';
import { initSongPreview } from '/song-preview.js';
import { patchCreationList } from '/stable-dom.js';
import { createPlaybackClock } from '/playback-clock.js';
import { SoundEngine } from '/sound-engine.js';
import { initCollections } from '/creator-collections.js';
import { initSpeechControls } from '/speech-controls.js';
import { initABCControls, abcOutputLabel } from '/abc-controls.js';
import { initWorkspaceMotion } from '/workspace-motion.js';
import { communityTracks as seeds } from '/music-catalog.js';
import { initPlayerLyrics } from '/player-visuals.js';
import { requestAssistant, withAIButton, isAssistantBusy } from '/ai-assistant.js';
import { api, openCloudState, saveCloudState, peekCloudState, flushCloudState } from '/cloud-state.js';
import { storeAudio } from '/training-audio-store.js';
import { initCoverControls } from '/cover-controls.js';
import { publishSong, unpublishSong, loadPublishedTracks } from '/published-music.js';
import { generationRequest, generationStatus, generationHint, isMusicPending, downloadMusic } from '/music-generation.js';
import {createTaskPoller,observeTaskPolling} from './task-poller.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const key = 'sanzo-workspace-v2';
const coverRecords=new Map();
const abcAudioCache=new Map();
window.addEventListener('pagehide',()=>{for(const audio of abcAudioCache.values())URL.revokeObjectURL(audio.url);abcAudioCache.clear();},{once:true});
let musicSubmitting=false,songPreview=null,uploadManager=null,trashManager=null;
const musicWave=()=>'<span class="music-loading-wave" aria-hidden="true">'+Array.from({length:7},()=>'<i></i>').join('')+'</span>';
function refreshGenerationFeedback() {
 if(busy&&!musicSubmitting)return;
 const pending=state.drafts.filter(d=>d.jobId&&isMusicPending(d.jobStatus));
 const preview=$('#generation-preview');preview.hidden=!musicSubmitting&&!pending.length;
 if(preview.hidden)return;
 const job=musicSubmitting?null:pending[0],stage=job?.jobStatus||'planning';
 preview.dataset.stage=stage;
 preview.querySelector('strong').textContent=musicSubmitting?(creationType==='speech'?'语音正在生成':'灵感正在成曲'):job.title+' · '+generationStatus[stage];
 $('#generation-step').textContent=(job?.type==='speech'||musicSubmitting&&creationType==='speech')?({planning:'正在准备文字与参考音色…',submitting:'正在提交语音生成…',queued:'等待语音生成开始…',running:'正在合成语音…'}[stage]||generationHint[stage]):generationHint[stage];
 preview.querySelector('.generation-pill').textContent=pending.length>1?pending.length+' 个创作中':'创作进行中';
}
const presets = {
 night:{title:'霓虹回响',description:'写一首适合深夜开车的中文歌。梦幻电子风格，温暖低音，歌词关于霓虹灯下的自由和思念。',styles:'dreamy electronic, warm bass, soft vocals',workspace:'night'},
 rain:{title:'雨夜来信',description:'写一首雨天咖啡馆里的歌。温暖的 Lo-fi 节奏，柔和钢琴，像写给自己的一封信。',styles:'lo-fi, piano, mellow drums, warm vocals',workspace:'night'},
 sunset:{title:'沿海公路',description:'海边的日落，一首关于告别与重新出发的独立流行歌曲，轻快吉他与温暖人声。',styles:'indie pop, acoustic guitar, warm vocals',workspace:'sunset'}
};
const modelNames={'ace-step':'ACE-Step-V15-XL','minimax-music':'MiniMax-Music-3',yue2:'YUE2'};
const ttsModelNames={'qwen-tts':'Qwen TTS','index-tts':'Index TTS'};
const creationTypes=['songs','speech','sounds','abc'];
const creationLabels={songs:'Songs',speech:'Speech',sounds:'Sounds',abc:'ABC'};
const defaultForm = () => ({type:'songs',mode:'simple',description:'',lyrics:'',styles:'',title:'',instrumental:false,backgroundMusic:true,model:'ace-step',songRvcModel:'',songLoraModel:'',exclude:'',gender:'auto',language:'zh',keyscale:'',timesignature:'',requestedBpm:'',weirdness:50,influence:70,workspace:'default',speechModel:'design',ttsModel:'qwen-tts',emotionVector:Array(8).fill(0),speechText:'',speechVoice:'warm',speechLanguage:'auto',voiceSource:'library',libraryVoice:'preset:warm',cloneSample:'',cloneName:'',svcSample:'',svcName:'',conversionModel:'svc',designText:'',voiceDescription:'',designVoice:'soft',speechMood:'calm',speechSpeed:1,rvcVoice:'',speechReference:'',soundsModel:'woosh-flow',soundPrompt:'',soundDuration:10,soundFormat:'wav',soundLoop:false,soundReference:'',abcInstrumental:false,abcBackgroundMusic:true,abcGender:'auto',abcSource:'upload',abcSourceId:'',abcPrompt:'',abcLyrics:'',abcNotation:'',abcFlow:'score',abcSynthesis:'simple',abcInstrument:'keys',abcTempo:'',abcScoreFormat:'numbered',abcAIPrompt:''});
const [stored] = await Promise.all([openCloudState('workspace'),openCloudState('training')]);
let previous = {};
const exampleDrafts = Object.entries(presets).map(([preset, value], i) => ({id:`draft-example-${preset}`,title:value.title,description:value.description,styles:value.styles,workspace:value.workspace,mode:i === 1?'custom':'simple',lyrics:i === 1?'[主歌]\n雨落在窗边的灯光里\n一杯咖啡温暖了回忆\n\n[副歌]\n把心事写成一封信\n寄给还在路上的自己':'',art:['liquid-glass.png','forest.jpg','coast.jpg'][i],kind:'draft',updated:'示例草稿',form:{...defaultForm(),...value,mode:i === 1?'custom':'simple'}}));
const migrated = Array.isArray(previous.creations) ? previous.creations.filter(t => t && typeof t.id==='string' && typeof t.title==='string').slice(0,50).map(t=>({id:t.id,title:t.title,description:t.prompt||'',styles:(t.tags||[]).join(', '),art:'liquid-glass.png',kind:'demo',workspace:'default',updated:'原有作品',lyrics:t.lyrics||'',form:{...defaultForm(),title:t.title,description:t.prompt||'',lyrics:t.lyrics||'',instrumental:!!t.instrumental}})) : [];
const cleanDraft = d => ({...d,title:String(d.title||'未命名灵感').slice(0,60),description:String(d.description||'').slice(0,5000),lyrics:String(d.lyrics||'').slice(0,5000),styles:String(d.styles||'').slice(0,1000),art:isSavedArtwork(d.art)?d.art:'liquid-glass.png',kind:d.kind==='generated'?'generated':d.kind==='demo'?'demo':'draft',workspace:typeof d.workspace==='string'?d.workspace:'default',trashed:!!d.trashed});
const state = {
 workspaces:stored.workspaces,voiceLibrary:stored.voiceLibrary,generationSeen:Array.isArray(stored.generationSeen)?stored.generationSeen:[],
 drafts: Array.isArray(stored.drafts) ? stored.drafts.filter(d=>d && typeof d.id==='string').slice(0,1000).map(cleanDraft) : [...migrated,...exampleDrafts],
 albums: Array.isArray(stored.albums) ? stored.albums.filter(a=>a && typeof a.id==='string' && typeof a.title==='string').map(a=>({...a,art:isSavedArtwork(a.art)?a.art:'liquid-glass.png',tracks:Array.isArray(a.tracks)?a.tracks.filter(id=>typeof id==='string'):[]})) : [
  {id:'album-night',title:'午夜来信',description:'留给安静夜晚的声音。温暖节奏、细微光线，与那些未说出口的故事。',art:'forest.jpg',tracks:['blue','jazz'],updated:'示例专辑'},
  {id:'album-sunset',title:'日落电台',description:'在日落与暮色之间，让每一段旋律陪你慢慢出发。',art:'coast.jpg',tracks:['sunset','afterglow'],updated:'示例专辑'},
  {id:'album-space',title:'星河漂流',description:'一些关于远方、宇宙和梦境的声音。',art:'mountains.jpg',tracks:['deep','dream'],updated:'示例专辑'}
 ],
 liked: Array.isArray(stored.liked)?stored.liked:Array.isArray(previous.liked)?previous.liked:['blue','deep'],
 form: {...defaultForm(),...(stored.form && typeof stored.form==='object'?stored.form:{})}
};
let view='create', mode='simple', creationType='songs', speechReference='', speechSourceID='', referenceUploading=false, soundReference='', editingId=null, exploreFilter='all', exploreQuery='', draftFilter='all', workspaceFilter='all', albumView=null, albumEdit=null, pendingTrack=null, busy=false;
function persist() { saveCloudState('workspace',state); }
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3200); }
function displayCreationTitle(work){return creationTitle(work,{voices:state.voiceLibrary||[],uploads:peekCloudState('uploads')?.items||[],training:peekCloudState('training')?.assets||[]});}
function allTracks() { return [...seeds,...(uploadManager?.tracks()||[]),...state.drafts.filter(d=>!d.trashed).map(d=>({id:d.id,title:displayCreationTitle(d),type:d.type||'songs',artist:'Sanzo Creator',style:inferStyle(d.styles),tags:[d.kind==='demo'?'Demo':'Draft',d.workspace==='night'?'After Hours':'Original'],art:d.art,cover:'glass',caption:d.title,audioURL:d.assetId?'/api/assets/'+d.assetId:abcAudioCache.get(d.id)?.url||null,assetId:d.assetId,duration:abcAudioCache.get(d.id)?.duration||(d.assetId?Number(d.form?.duration)||120:d.type==='sounds'?Number(d.form?.soundDuration)||10:d.type==='speech'?15:180),prompt:d.description,lyrics:d.lyrics,instrumental:!!d.form?.instrumental}))]; }
function findTrack(id) { return allTracks().find(t=>t.id===id); }
function inferStyle(styles) { const s=String(styles||'').toLowerCase();return /lo-fi|chill/.test(s)?'chill':/jazz/.test(s)?'jazz':/ambient/.test(s)?'ambient':/cinematic|弦乐/.test(s)?'cinematic':/pop|guitar/.test(s)?'pop':'electronic'; }
function menu(t, own=false) { if(own&&t.trashed)return `<details class="track-menu"><summary aria-label="更多操作 ${esc(t.title)}">${icon('more')}</summary><div class="action-menu">${collections.actions(t)}</div></details>`;const music=!t.type||t.type==='songs';return `<details class="track-menu"><summary aria-label="更多操作 ${esc(t.title)}">${icon('more')}</summary><div class="action-menu"><button data-action="reuse" data-id="${esc(t.id)}">复用输入</button>${music?`<button data-action="cover" data-id="${esc(t.id)}">翻唱 / Cover</button><button data-action="album" data-id="${esc(t.id)}">加入专辑</button>`:''}${own?`${collections.actions(t)}`:''}${own&&music?`<button data-song-preview="${esc(t.id)}">查看作品 / 封面管理</button>`:''}${own&&music&&t.assetId&&t.jobId?`<button data-action="publish" data-id="${esc(t.id)}">${t.published?'取消发布':'发布单曲'}</button>`:''}${t.type==='abc'?`<button data-abc-preview="${esc(t.id)}">乐谱预览 / 转简谱</button><button data-abc-download="${esc(t.id)}">下载 ABC 文本</button>${t.assetId?`<button data-download-music="${esc(t.id)}">下载 MP3</button>`:''}`:t.assetId?`<button data-download-music="${esc(t.id)}">下载 MP3</button>`:t.type==='abc'?`<button data-abc-preview="${esc(t.id)}">乐谱预览 / 下载</button><button data-abc-download="${esc(t.id)}">下载 ABC 文本</button>`:'<button data-notice="导出入口已预留，当前仅演示创作流程。">下载 / Export</button>'}</div></details>`; }
function renderExplore() {
 const list=seeds.filter(t=>(exploreFilter==='all'||t.style===exploreFilter)&&(t.title+' '+t.artist+' '+t.tags.join(' ')).toLowerCase().includes(exploreQuery.toLowerCase()));
 $('#explore-tracks').innerHTML=list.map(t=>`<article class="track-card ${playing&&current.id===t.id?'is-playing':''}"><div class="track-art cover-${t.cover}"><img decoding="async" src="${artworkURL(t.art)}" alt="${esc(t.title)} 示例封面" loading="lazy"><div class="track-cover-text"><small>SANZO / COMMUNITY DEMO</small>${esc(t.caption)}</div><button class="cover-play" data-play="${t.id}" aria-label="${playing&&current.id===t.id?'暂停':'播放'} ${esc(t.title)}">${icon(playing&&current.id===t.id?'pause':'play')}</button><span class="track-duration">${time(t.duration)}</span></div><div class="track-title-row"><h3>${esc(t.title)}</h3><button class="track-heart" data-like="${t.id}" aria-label="${state.liked.includes(t.id)?'取消收藏':'收藏'} ${esc(t.title)}" aria-pressed="${state.liked.includes(t.id)}">${icon('heart')}</button></div><div class="track-meta"><span class="track-artist">${esc(t.artist)}</span>${menu(t)}</div><div class="track-tags">${t.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div></article>`).join('');
 $('#explore-empty').hidden=!!list.length;
 $('#creators').innerHTML=[['L','Luna Waves','Lo-fi · 夜晚的温柔'],['N','NEON / 霓虹','Electronic · 城市光影'],['E','Echo Studio','Cinematic · 无垠梦境']].map(c=>`<article class="creator-card glass"><span class="creator-avatar-mini">${c[0]}</span><div><strong>${c[1]}</strong><small>${c[2]}</small></div><button data-follow="${c[1]}" aria-pressed="false" aria-label="关注 ${c[1]}">关注</button></article>`).join('');
}
function renderDrafts() {trashManager?.render();uploadManager?.refresh();
 const drafts=collections.visible();collections.renderToolbar();
 $('#draft-count').textContent=collections.isTrash()?state.drafts.filter(d=>d.trashed).length+' 个已移除':state.drafts.filter(d=>!d.trashed).length+' 个作品';
 const markup=drafts.map(d=>{
  const compact=['speech','sounds'].includes(d.type),isABC=d.type==='abc',abcCover=isABC&&!!d.jobId&&d.form?.abcFlow==='score',hasScore=isABC&&d.form?.abcNotation?.trim(),speechLabel=d.form?.speechModel==='design'?'Qwen TTS · 音色设计':d.form?.speechModel==='rvc'?(d.form?.conversionModel==='svc'?'SVC':'RVC'):(ttsModelNames[d.form?.ttsModel]||'Qwen TTS');
  const pending=!!d.jobId&&isMusicPending(d.jobStatus)&&!d.trashed;
  const abcLabel=abcOutputLabel(d),status=d.trashed?'已移除':d.published?'已发布':d.jobId?(generationStatus[d.jobStatus]||'生成中'):isABC?(d.abcOutput==='ai'?'待接入':d.prototype?'原型示例':d.abcOutput==='audio'?'可试听':d.abcOutput==='staff'||d.abcOutput==='numbered'?'已排版':'草稿'):d.jobId?(generationStatus[d.jobStatus]||'生成中'):d.kind==='demo'?'演示版本':'草稿';
  return `<article class="draft-card ${pending?'is-generating':''} kind-${d.type||'songs'} ${isABC?'output-'+esc(d.abcOutput||'abc'):''} ${compact?'audio-result':''} ${d.trashed?'is-trashed':''} ${editingId===d.id?'is-editing':''}" data-creation-id="${esc(d.id)}" data-trashed="${!!d.trashed}" draggable="${!d.trashed}"><div class="draft-art">${isABC?(abcCover?`<img decoding="async" src="${artworkURL(d.art)}" alt="${esc(d.title)} 乐谱封面">`:icon(d.abcOutput==='audio'?'audio':'score')+`<span>${{numbered:'1 2 3',staff:'SCORE',audio:'AUDIO',ai:'AI / ABC'}[d.abcOutput]||'ABC'}</span>`):compact?icon(d.type==='speech'?'voice':'audio'):`<img decoding="async" src="${artworkURL(d.art)}" alt="${esc(d.title)} 草稿封面">`}${pending?musicWave():['planning','submitting','queued','running'].includes(d.coverStatus)?'<span class="cover-generating-label">封面绘制中</span>':''}${hasScore&&!d.trashed?`<button class="cover-play" data-abc-preview="${esc(d.id)}" aria-label="预览 ${esc(d.title)}">${icon('score')}</button>`:(d.kind==='demo'||d.assetId)&&!d.trashed&&!isABC?`<button class="cover-play" data-play="${esc(d.id)}" aria-label="${compact?'预览':'播放'} ${esc(d.title)}">${icon(playing&&current.id===d.id?'pause':'play')}</button>`:''}</div><div class="draft-body"><div class="draft-topline"><h3>${esc(displayCreationTitle(d))}</h3><span class="status-tag ${d.kind==='demo'?'demo':''}">${status}</span><span class="draft-type">${isABC?abcLabel:creationLabels[d.type]||'Songs'}</span></div><p class="${pending?'draft-generation-hint':''}">${esc(pending?(d.type==='speech'?({planning:'准备文字与音色…',submitting:'提交语音生成…',queued:'等待语音生成开始…',running:'合成语音…'}[d.jobStatus]||generationHint[d.jobStatus]):generationHint[d.jobStatus]):d.jobError||d.description||d.styles||'一个等待被听见的新想法。')}</p><div class="draft-info"><span>${esc(collections.name(d.workspace,d.type))}</span><span>${isABC?abcLabel:d.type==='speech'?speechLabel:d.type==='sounds'?(d.form?.soundsModel==='woosh-vflow'?'Woosh V2A':'Woosh T2A'):(d.mode==='custom'?'高级选项':'Simple')}</span><span>${esc(d.updated||'刚刚保存')}</span></div></div><div class="draft-controls">${d.trashed?`<button class="outline-button" data-restore-creation="${esc(d.id)}">恢复</button>`:`${isABC?`<button class="outline-button" data-play="${esc(d.id)}" data-play-text="播放" aria-label="播放 ${esc(d.title)}" ${d.assetId||hasScore&&d.abcOutput==='audio'?'':'disabled'}>${icon(playing&&current.id===d.id?'pause':'play')}<span>播放</span></button><button class="outline-button" data-abc-preview="${esc(d.id)}" ${hasScore?'':'disabled'}>${icon('score')}预览</button>`:''}<button class="outline-button" data-edit-draft="${esc(d.id)}">${icon('create')}编辑</button>`}${menu(d,true)}</div></article>`;
 }).join('');
 patchCreationList($('#draft-list'),markup);
 $('#draft-empty').hidden=!!drafts.length;
 refreshGenerationFeedback();
 songPreview?.refresh();
}
function navigate(next, updateHash=true) {
 next=({materials:'uploads','materials-trash':'trash'})[next]||next;
 if(next==='explore'){location.href='/explore/';return;}
 if(!['explore','create','library','uploads','trash'].includes(next))return;
 const changing=view!==next;
 if(next!=='create')songPreview?.close();
 view=next;document.body.dataset.workspaceView=next;$$('[data-view]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.view===next));b.tabIndex=b.dataset.view===next?0:-1;});
 ['explore','create','library','uploads','trash'].forEach(v=>$('#view-'+v).hidden=v!==next);
 if(updateHash)history.replaceState(null,'','#'+(next==='uploads'?'materials':next==='trash'?'materials-trash':next));
 window.dispatchEvent(new Event('sanzo-view-change'));
 if(next==='explore')renderExplore();else if(next==='create')renderDrafts();else if(next==='uploads')uploadManager.show();else if(next==='trash')trashManager.show();else renderLibrary();
 if(changing)$('#content-panel').scrollIntoView({block:'start'});
}
function setMode(next) {
 mode=next==='custom'?'custom':'simple';
 document.body.dataset.songMode=mode;
 const simple=mode==='simple';
 $('#song-advanced-options').hidden=simple;
 $$('[data-mode]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.mode===mode));b.tabIndex=b.dataset.mode===mode?0:-1;});
 refreshSongPanels();refreshInstrumental();
 $('.composer-scroll').scrollTop=0;
}
function refreshSongPanels() {
 const advanced=creationType==='songs'&&mode==='custom';
 $('#song-basic-fields').hidden=advanced;
 $$('.composer-scroll>.title-field,.composer-scroll>.workspace-field').forEach(field=>field.hidden=advanced);
}
function setCreationType(next, keepEditing=false) {
 const type=creationTypes.includes(next)?next:'songs';
 if(type!==creationType&&!keepEditing){editingId=null;$('#editing-label').textContent='新的灵感';}
 const resetDestination=type!==creationType&&!keepEditing&&(['speech','abc'].includes(type)||['speech','abc'].includes($('#draft-workspace').value));
 creationType=type;document.body.dataset.creationType=type;collections.refreshDestinations();if(resetDestination)$('#draft-workspace').value=['speech','abc'].includes(type)?type:'default';refreshSongPanels();
 $$('[data-type]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.type===type));b.tabIndex=b.dataset.type===type?0:-1;});
 creationTypes.forEach(t=>$('#'+t+'-fields').hidden=t!==type);
 $('#music-model-row').hidden=type!=='songs';$('#song-mode-tabs').hidden=type!=='songs';
 const titles={songs:'创作新音乐',speech:'让文字开口',sounds:'为场景赋声',abc:'写下新的旋律'};
 $('#composer-title').innerHTML=titles[type]+'<span>。</span>';
 $('#composer-eyebrow').textContent={songs:'MAKE SOMETHING YOURS',speech:'WORDS INTO VOICE',sounds:'EVERY SCENE HAS A SOUND',abc:'TEXT INTO SCORE'}[type];
 $('#work-title-label').textContent={songs:'歌曲名称',speech:'语音名称',sounds:'音效名称',abc:'乐谱名称'}[type];
 $('#generate span').textContent={songs:'创作音乐',speech:'生成语音',sounds:'生成音效',abc:'预览乐谱'}[type];
 $('.composer-footer>p').textContent=type==='songs'||type==='speech'&&($('#speech-model').value==='design'||$('#speech-model').value==='tts'&&['qwen-tts','index-tts'].includes($('#tts-model').value))?'真实生成 · 消耗 RunningHub 账户额度':'DeepSeek 辅助创作 · 音频生成为原型演示';
 $('.composer-scroll').scrollTop=0;refreshSpeechMode();refreshSoundsMode();abcControls.refresh();if(!busy)$('#generate').disabled=type==='sounds'&&!WOOSH_AVAILABLE;
}
function refreshSpeechMode(){if(!['design','tts'].includes($('#speech-model').value))$('#speech-model').value='design';if(creationType==='speech')$('.composer-footer>p').textContent=($('#speech-model').value==='design'||$('#speech-model').value==='tts'&&['qwen-tts','index-tts'].includes($('#tts-model').value))?'真实生成 · 消耗 RunningHub 账户额度':'DeepSeek 辅助创作 · 音频生成为原型演示';$$('#speech-fields audio').forEach(a=>a.pause());const mode=$('#speech-model').value;$$('[data-speech-mode]').forEach(b=>{const selected=b.dataset.speechMode===mode;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});['tts','rvc','design'].forEach(m=>$('#'+m+'-fields').hidden=m!==mode);$('#speech-tts-model-row').hidden=mode!=='tts';$('#speech-summary').textContent={tts:'让文字有温度，让故事被听见。',rvc:'延续表达，让声音有另一种可能。',design:'用几句话，描绘一种新的声音。'}[mode];}
function refreshSoundsMode() { $('#woosh-controls').disabled=!WOOSH_AVAILABLE;$('#woosh-unavailable').hidden=WOOSH_AVAILABLE;if(creationType==='sounds'&&!WOOSH_AVAILABLE){$('#generate').disabled=true;$('#generate span').textContent='音效生成暂不可用';$('.composer-footer>p').textContent='Woosh 服务暂时停用';}const video=$('#sounds-model').value==='woosh-vflow';$('#sound-video-field').hidden=!video;$('#sound-prompt').placeholder=video?'选填：描述画面里需要强调的动作、环境或声音…':'比如：雨水落在树叶上，远处传来低沉雷声，湿润而开阔的森林空间…'; }
function refreshInstrumental() { const checked=$('#instrumental').checked;$('#vocal-gender').disabled=checked;$('#song-rvc-model').disabled=checked;$('#lyrics').disabled=checked;$$('#write-lyrics,#write-simple-lyrics,#translate-lyrics').forEach(button=>button.disabled=checked||isAssistantBusy());$('#lyrics').placeholder=checked?'纯音乐模式，不需要歌词。':'[主歌]\n写下你想唱出的故事…\n\n[副歌]\n让一句话成为旋律。';refreshABCWritingOptions();refreshMusicCapabilities(); }
function refreshABCWritingOptions() { const checked=$('#abc-instrumental').checked;$('#abc-vocal-gender').disabled=checked;$('#write-abc-lyrics').disabled=checked||isAssistantBusy(); }
function refreshSongModels() {
 let models=[{id:'demo-rvc',name:'Luna Voice · v1',kind:'voice'},{id:'demo-yue',name:'Neon Dream · v1',kind:'style'}];
 const saved=peekCloudState('training');if(Array.isArray(saved?.models))models=saved.models;
 for(const [id,kind,label] of [['song-rvc-model','voice','不使用 · 默认人声'],['song-lora-model','style','不使用 · 默认曲风'],['rvc-voice','voice','选择已训练的 RVC 模型']]) {
  const select=$('#'+id),previous=select.value;
  const options=models.filter(model=>model&&model.kind===kind&&typeof model.id==='string'&&typeof model.name==='string');
  select.innerHTML=`<option value="">${label}</option>`+options.map(model=>`<option value="${esc(model.id)}">${esc(model.name)} · 演示模型</option>`).join('');
  select.value=options.some(model=>model.id===previous)?previous:'';
 }
}
const formFields={description:'song-description',lyrics:'lyrics',styles:'style-prompt',title:'song-title',model:'model',songRvcModel:'song-rvc-model',songLoraModel:'song-lora-model',gender:'vocal-gender',language:'lyric-language',keyscale:'song-keyscale',timesignature:'song-timesignature',requestedBpm:'song-bpm',weirdness:'weirdness',influence:'style-influence',workspace:'draft-workspace',speechModel:'speech-model',ttsModel:'tts-model',speechText:'speech-text',voiceSource:'voice-source',libraryVoice:'library-voice',conversionModel:'conversion-model',designText:'design-text',voiceDescription:'voice-description',designVoice:'design-voice',speechMood:'speech-mood',speechSpeed:'speech-speed',rvcVoice:'rvc-voice',soundsModel:'sounds-model',soundPrompt:'sound-prompt',soundDuration:'sound-duration',soundFormat:'sound-format',abcGender:'abc-vocal-gender',abcPrompt:'abc-prompt',abcLyrics:'abc-lyrics',abcNotation:'abc-notation',abcFileName:'abc-file-name',abcSource:'abc-source',abcSourceId:'abc-workspace-score',abcFlow:'abc-flow',abcSynthesis:'abc-synthesis',abcInstrument:'abc-instrument',abcTempo:'abc-tempo',abcScoreFormat:'abc-score-format'};
function isSongLyrics(text) { return /^\s*\[[^\]\r\n]+\]/m.test(text)||text.trim().split('\n').length>=3; }
function readForm() { const f={type:creationType,mode,exclude:'',instrumental:$('#instrumental').checked,backgroundMusic:true,abcInstrumental:$('#abc-instrumental').checked,abcBackgroundMusic:true,abcGender:$('#abc-vocal-gender').value,soundLoop:$('#sound-loop').checked,speechReference,speechSourceID,soundReference,speechLanguage:'auto',...speechControls.read()};for(const [name,id] of Object.entries(formFields))f[name]=$('#'+id).value;if(f.type==='speech'&&f.speechModel==='design')f.ttsModel='qwen-tts';if(isSongLyrics(f.description))f.lyrics=f.description;if(f.instrumental)f.lyrics='';return f; }
function fillForm(form) {
 refreshSongModels();
 if(!['zh','en','ja','ko','es','fr','de','vi','ru'].includes(form.language))form={...form,language:'zh'};
 if(form.abcFlow==='music'&&form.abcSynthesis==='ai'&&!form.abcPrompt&&form.abcAIPrompt)form={...form,abcPrompt:form.abcAIPrompt};
 const f={...defaultForm(),...form};if(!['design','tts'].includes(f.speechModel))f.speechModel='design';if(['speech','abc'].includes(f.type)&&f.workspace==='default')f.workspace=f.type;if(f.mode==='custom'&&f.lyrics)f.description=f.lyrics;if(!['calm','happy','sad','angry','surprise','gentle'].includes(f.speechMood))f.speechMood=f.speechMood==='bright'?'happy':'calm';if(!state.workspaces.some(w=>w.id===f.workspace))f.workspace='default';f.ttsModel=ttsModelNames[f.ttsModel]?f.ttsModel:'qwen-tts';f.model=modelNames[f.model]?f.model:({standard:'ace-step',wild:'minimax-music',mini:'yue2'}[f.model]||'ace-step');if(!Array.from($('#rvc-voice').options).some(option=>option.value===f.rvcVoice))f.rvcVoice='';for(const [name,id] of Object.entries(formFields))$('#'+id).value=f[name];
 $('#instrumental').checked=!!f.instrumental;$('#vocal-gender').value=['auto','female','male'].includes(f.gender)?f.gender:'auto';$('#sound-loop').checked=!!f.soundLoop;
 $('#abc-instrumental').checked=!!f.abcInstrumental;$('#abc-vocal-gender').value=['auto','female','male'].includes(f.abcGender)?f.abcGender:'auto';
 $('#speech-file').value='';$('#sound-video').value='';speechReference=String(f.speechReference||'');speechSourceID=String(f.speechSourceID||'');soundReference=String(f.soundReference||'');
 $('#speech-file-name').textContent=speechReference?(speechSourceID?'云端音频 · ':'参考记录 · ')+speechReference+(speechSourceID?'':'（生成前请重新选择文件）'):'保留原有表达，探索另一种声音。';
 $('#sound-video-name').textContent=soundReference?'参考记录 · '+soundReference+'（生成前请重新选择文件）':'根据画面里的动作与环境，设计同步声音。';
 speechControls.fill(f);abcControls.fill(f);refreshMusicCapabilities();setMode(f.mode);setCreationType(f.type,true);updateFormStatus();
}
function updateFormStatus() { $('#description-count').textContent=`${$('#song-description').value.length} / 5000`;$('#speech-count').textContent=`${$('#speech-text').value.length} / 3000`;$('#sound-count').textContent=`${$('#sound-prompt').value.length} / 1000`;$('#abc-count').textContent=`${$('#abc-notation').value.length} / 50000`;$('#abc-lyrics-count').textContent=`${$('#abc-lyrics').value.length} / 5000`;$$('.advanced-content input[type=range]').forEach(r=>$(`output[for="${r.id}"]`).textContent=r.value+'%');$('output[for="speech-speed"]').textContent=Number($('#speech-speed').value).toFixed(1)+'×';state.form=readForm();persist(); }
function startNew() { const type=creationType;editingId=null;fillForm({...defaultForm(),type,model:$('#model').value,speechModel:$('#speech-model').value,ttsModel:$('#tts-model').value,soundsModel:$('#sounds-model').value});$('#editing-label').textContent='新的灵感';renderDrafts();(type==='abc'?$('#abc-prompt'):type==='songs'?$('#song-description'):type==='speech'?$('#'+($('#speech-model').value==='design'?'design-text':$('#speech-model').value==='rvc'?'speech-file':'speech-text')):$('#sound-prompt')).focus({preventScroll:true}); }
function loadDraft(id) { const d=state.drafts.find(d=>d.id===id);if(!d||d.trashed)return;if(['seedvc-speech','seedvc-song'].includes(d.form?.model)){flushCloudState('workspace').then(()=>{location.href='/studio/?edit='+encodeURIComponent(d.jobId);}).catch(error=>toast(error.message));return;}editingId=id;fillForm({...d.form,title:d.title,description:d.description,styles:d.styles,lyrics:d.lyrics,mode:d.mode||d.form?.mode});$('#editing-label').textContent='正在编辑 · '+d.title;navigate('create');if(innerWidth<=780)$('.composer-panel').scrollIntoView({behavior:'smooth'});toast('草稿已载入左侧创作面板。'); }
function describeForm(form) { return form.type==='abc'?(form.abcPrompt.trim()||'ABC 乐谱 · '+(form.abcNotation.match(/^T:\s*(.+)$/m)?.[1]||'新的旋律')):form.type==='speech'?(form.speechModel==='design'?form.designText.trim():form.speechModel==='rvc'?'声音转换 · '+(form.speechReference||'待选择音频')+' · '+(form.conversionModel==='svc'?'SVC 参考音色 · '+(form.svcName||'待选择'):$('#rvc-voice').selectedOptions[0].text):form.speechText.trim()):form.type==='sounds'?(form.soundPrompt.trim()||'视频参考 · '+(form.soundReference||'待选择视频')):form.description.trim(); }
function resetDraftFilters(){collections.showAll();}
async function generatePreview() {
 if(busy||isAssistantBusy())return;let form=readForm();if(form.type==='sounds'&&!WOOSH_AVAILABLE){toast('Woosh 音效生成暂不可用，恢复后再开放。');return;}
 if(form.type==='abc'){await abcControls.generate(form);return;}
 if(form.type==='songs'&&!form.description.trim()){toast(mode==='simple'?'描述一下你想听见的歌曲。':'填写歌词或音乐风格，开始这次创作。');setMode('simple');$('#song-description').focus();return;}
 if(form.type==='speech'){const error=await speechControls.validate(form);if(error){toast(error);return;}}
 if(busy||isAssistantBusy())return;
 if(form.type==='speech'&&form.speechModel==='tts'&&form.ttsModel==='index-tts'){
  const fields=['type','speechText','title','libraryVoice','cloneSample','voiceSource','workspace','ttsModel','speechModel'],snapshot=JSON.stringify(fields.map(key=>form[key]));
  busy=true;$('#generate').disabled=true;const label=$('#generate span').textContent;$('#generate span').textContent='准备情绪…';
  try{await speechControls.prepareEmotion();const updated=readForm();if(JSON.stringify(fields.map(key=>updated[key]))!==snapshot){toast('语音设置已改变，请重新生成。');return;}form=updated;}
  catch(error){toast(error.message);return;}
  finally{busy=false;$('#generate').disabled=creationType==='sounds'&&!WOOSH_AVAILABLE;$('#generate span').textContent=label;}
 }

 if(referenceUploading){toast('原始语音正在上传，请稍候。');return;}
 if(form.type==='speech'&&form.speechModel==='rvc'&&!speechSourceID){toast('先上传一段原始语音。');return;}
 if(form.type==='sounds'&&form.soundsModel==='woosh-flow'&&!form.soundPrompt.trim()){toast('描述一下场景、声源与声音的变化。');$('#sound-prompt').focus();return;}
 if(form.type==='sounds'&&form.soundsModel==='woosh-vflow'&&!$('#sound-video').files.length){toast('先选择一段视频参考。');return;}
 if(form.type==='songs'&&(!isSongLyrics(form.description)||form.instrumental)&&musicSignature(form)!==aiBriefSignature) {
   const snapshot=JSON.stringify(form);
   try {
     let changed=false;
     musicSubmitting=true;refreshGenerationFeedback();
     await withAIButton($('#generate'),'AI 构思中…',async()=>{
       toast('AI 正在构思歌词与音乐风格…');
       const result=await requestAssistant({action:'brief',kind:'songs',text:form.description.slice(0,500),context:aiContext(form)});
       if(JSON.stringify(readForm())!==snapshot){changed=true;toast('创作内容已改变，保留了新的输入，请重新创作。');return;}
       $('#style-prompt').value=result.styles;
       $('#lyrics').value=result.lyrics;
       if(!form.title.trim())$('#song-title').value=result.title;
       updateFormStatus();form=readForm();aiBriefSignature=musicSignature(form);
     });
     if(changed)return;
   }catch(error){toast(error.message);return;}
   finally{musicSubmitting=false;refreshGenerationFeedback();refreshInstrumental();}
 }
 if(form.type==='songs'||form.type==='speech'&&(form.speechModel==='design'||form.speechModel==='tts'&&['qwen-tts','index-tts'].includes(form.ttsModel))){await generateMusic(form);return;}
 busy=true;$('#generate').disabled=true;$$('[data-type]').forEach(b=>b.disabled=true);$('#generation-preview').hidden=false;draftFilter='all';workspaceFilter='all';resetDraftFilters();navigate('create');
 const steps=form.type==='songs'?['构思歌词与结构…','编织旋律与声音…','准备两个演示版本…']:form.type==='speech'?(form.speechModel==='design'?['解析文字与音色描述…',`配置 ${ttsModelNames[form.ttsModel]} 设计音色…`,'准备音色设计预览…']:form.speechModel==='rvc'?['读取声音参考…','匹配目标音色…','准备转换流程预览…']:['解析文字与停顿…',`配置 ${ttsModelNames[form.ttsModel]} 与语速…`,'准备语音流程预览…']):['理解场景与声源…','编排空间与声音层次…','准备音效流程预览…'];
 for(const step of steps) { $('#generation-step').textContent=step;await new Promise(resolve=>setTimeout(resolve,650)); }
 const baseTitle=(form.title.trim()||{songs:'新的声音',speech:'一段新旁白',sounds:'新的音效',abc:'新的乐谱'}[form.type]).slice(0,54);
 const versions=form.type==='songs'?['A','B']:['预览'];
 versions.reverse().forEach(version=>state.drafts.unshift({id:'demo-'+crypto.randomUUID(),type:form.type,title:`${baseTitle} · ${version}`,description:describeForm(form)||'自定义创作 · '+form.styles,lyrics:form.lyrics,styles:form.styles,mode,workspace:form.workspace,art:'liquid-glass.png',kind:'demo',updated:'演示版本 · 刚刚',form:{...form,title:`${baseTitle} · ${version}`}}));
 persist();busy=false;$('#generate').disabled=creationType==='sounds'&&!WOOSH_AVAILABLE;$$('[data-type]').forEach(b=>b.disabled=false);$('#generation-preview').hidden=true;renderDrafts();toast(form.type==='songs'?'已展示 A / B 两个演示版本，可试听合成器 Demo。':'已展示'+(form.type==='speech'?'语音':'音效')+'结果卡片；真实音频模型将在后续接入。');
}
function trackAction(action,id) {
 const t=findTrack(id);if(!t)return;
 if(action==='publish'){const draft=state.drafts.find(d=>d.id===id);if(draft?.assetId&&draft.jobId)publishCreation(draft);return;}
 if(action==='album'){pendingTrack=id;albumView=null;albumEdit=null;navigate('library');return;}
 const own=state.drafts.find(d=>d.id===id);
 editingId=null;fillForm(own?.form?{...own.form,title:t.title}: {...defaultForm(),description:t.prompt,styles:t.tags.join(', '),title:t.title});
 if(action==='cover'){setMode('custom');$('#song-title').value=t.title+' · 翻唱';$('#style-prompt').value=t.tags.join(', ');$('#song-description').value=t.prompt;toast('翻唱'+'设想已载入，可在高级选项中选择人声与曲风模型。');}else toast('提示词已填入左侧，可以继续修改。');
 updateFormStatus();$('#editing-label').textContent='基于 · '+t.title;
 if(innerWidth<=780)$('.composer-panel').scrollIntoView({behavior:'smooth'});
}

function renderLibrary() {
 const target=$('#library-content');
 if(albumEdit){renderAlbumEditor();return;}
 if(albumView){renderAlbumDetail();return;}
 target.innerHTML=`<div class="view-heading"><div><span class="micro-label">YOUR SOUND, COLLECTED</span><h2>我的专辑</h2><p>让散落的旋律，成为一个完整的故事。</p></div><button class="outline-button" data-new-album>${icon('plus')}创建专辑</button></div>${pendingTrack?`<div class="pending-track"><span>将「${esc(findTrack(pendingTrack)?.title)}」加入哪张专辑？</span><button class="small-text-button" data-cancel-pending>取消</button></div>`:''}<div class="album-grid">${state.albums.map(a=>`<article class="album-card"><button class="album-open" data-open-album="${esc(a.id)}" aria-label="打开专辑 ${esc(a.title)}"><div class="album-art"><img decoding="async" src="${artworkURL(a.art)}" alt="${esc(a.title)} 专辑封面"><small>SANZO / ALBUM</small><span>${esc(a.title)}</span></div><h3>${esc(a.title)}</h3></button><p>${a.tracks.length} 首作品 · 私人专辑</p><div class="album-card-bottom"><span>${esc(a.updated||'本地保存')}</span><button data-edit-album="${esc(a.id)}">编辑专辑</button></div>${pendingTrack?`<button class="secondary-button album-add-button" data-add-to-album="${esc(a.id)}">${icon('plus')}加入这张专辑</button>`:''}</article>`).join('')}</div><div class="library-caption glass">${icon('library')}<span>专辑可以编辑名称、封面、介绍与歌曲顺序。<br>内容只保存在当前浏览器。</span></div>`;
}
function renderAlbumDetail() {
 const a=state.albums.find(a=>a.id===albumView);if(!a){albumView=null;renderLibrary();return;}
 const songs=a.tracks.map(findTrack).filter(Boolean);
 $('#library-content').innerHTML=`<button class="back-button" data-albums-back>${icon('arrow')}返回专辑</button><div class="album-detail-header"><div class="album-art"><img decoding="async" src="${artworkURL(a.art)}" alt="${esc(a.title)} 专辑封面"><span>${esc(a.title)}</span></div><div class="album-detail-info"><span class="micro-label">PRIVATE ALBUM / SANZO CREATOR</span><h2>${esc(a.title)}</h2><p>${esc(a.description||'一个新的音乐故事。')}</p><small>${songs.length} 首作品 · ${time(songs.reduce((n,t)=>n+t.duration,0))}</small></div></div><div class="album-detail-actions"><button class="primary-button" data-play-album="${esc(a.id)}" ${songs.length?'':'disabled'}>${icon('play')}播放专辑</button><button class="secondary-button" data-edit-album="${esc(a.id)}">${icon('create')}编辑专辑</button></div><div class="album-song-list">${songs.map((t,i)=>`<article class="album-song"><span>${String(i+1).padStart(2,'0')}</span><button data-play="${esc(t.id)}" aria-label="播放 ${esc(t.title)}">${icon(playing&&current.id===t.id?'pause':'play')}</button><img decoding="async" src="${artworkURL(t.art)}" alt=""><div class="album-song-title"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><small>${time(t.duration)}</small>${menu(t)}</article>`).join('')}</div>${songs.length?'':'<div class="empty-state">编辑这张专辑，加入你的第一首作品。</div>'}`;
}
function startAlbumEdit(id=null) { const a=state.albums.find(a=>a.id===id);albumEdit=a?{...a,tracks:[...a.tracks]}:{id:null,title:'',description:'',art:'liquid-glass.png',tracks:pendingTrack?[pendingTrack]:[]};renderAlbumEditor(); }
function renderAlbumEditor() {
 const a=albumEdit;
 $('#library-content').innerHTML=`<div class="view-heading"><div><span class="micro-label">CURATE YOUR OWN STORY</span><h2>${a.id?'编辑专辑':'创建专辑'}</h2><p>为你的作品选择一个名字、一张封面和一种顺序。</p></div></div><form id="album-form" class="album-editor glass"><div class="album-editor-top"><div class="album-art"><img id="album-cover-preview" src="${artworkURL(a.art)}" alt="专辑封面预览"><span id="album-title-preview">${esc(a.title||'新的\n故事。')}</span></div><div><label for="album-title">专辑名称</label><input id="album-title" value="${esc(a.title)}" maxlength="60" required placeholder="比如：午夜来信"><label for="album-description">专辑介绍</label><textarea id="album-description" maxlength="500" placeholder="关于这张专辑，你想说些什么？">${esc(a.description)}</textarea></div></div><label>专辑封面</label><div class="cover-options" role="group" aria-label="选择专辑封面">${[['liquid-glass.png','液态玻璃'],['forest.jpg','午夜森林'],['coast.jpg','海岸日落'],['mountains.jpg','星空山峦']].map(([file,label])=>`<button type="button" class="cover-option" data-album-cover="${file}" aria-pressed="${a.art===file}">${label}</button>`).join('')}</div><div class="cover-edit-actions"><button type="button" class="outline-button" data-cover-redo data-cover-type="album" data-cover-target="${esc(a.id||'new')}">${icon('spark')}AI 重做封面</button><button type="button" class="outline-button" data-cover-upload data-cover-type="album" data-cover-target="${esc(a.id||'new')}">${icon('upload')}上传封面</button><small>生成繁忙时自动使用备用图片 · JPG / PNG / WebP，最多 8 MB</small></div><div class="album-editor-section-heading"><h3>作品顺序</h3><span>调整歌曲，让故事流动起来。</span></div><div id="selected-album-songs"></div><details class="add-song-picker" open><summary>选择要加入专辑的作品</summary><div id="album-song-choices"></div></details><div class="album-editor-actions"><button type="button" class="secondary-button" data-cancel-album>取消</button><button type="submit" class="primary-button">${icon('save')}保存专辑</button></div></form>`;
 renderAlbumSongs();
 $('#album-title').addEventListener('input',e=>{a.title=e.target.value;$('#album-title-preview').textContent=a.title||'新的故事。';});
 $('#album-description').addEventListener('input',e=>a.description=e.target.value);
 $('#album-form').addEventListener('submit',e=>{e.preventDefault();if(!a.title.trim()){toast('给这张专辑取一个名字。');return;}a.title=a.title.trim();a.id=a.id||'album-'+crypto.randomUUID();a.updated='刚刚编辑';const old=state.albums.findIndex(item=>item.id===a.id);if(old<0)state.albums.unshift({...a,tracks:[...a.tracks]});else state.albums[old]={...a,tracks:[...a.tracks]};persist();albumView=a.id;albumEdit=null;pendingTrack=null;renderLibrary();toast('专辑正在保存到云端。');});
}
function renderAlbumSongs() {
 const a=albumEdit;
 $('#selected-album-songs').innerHTML=a.tracks.length?a.tracks.map((id,i)=>{const t=findTrack(id);return `<div class="selected-song"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(t?.title||'未命名作品')}</strong><button type="button" class="reorder-button" data-move-song="${esc(id)}" data-direction="-1" aria-label="上移 ${esc(t?.title)}" ${i===0?'disabled':''}>↑</button><button type="button" class="reorder-button" data-move-song="${esc(id)}" data-direction="1" aria-label="下移 ${esc(t?.title)}" ${i===a.tracks.length-1?'disabled':''}>↓</button><button type="button" class="remove-song" data-remove-song="${esc(id)}" aria-label="移除 ${esc(t?.title)}">${icon('close')}</button></div>`;}).join(''):'<p class="field-help">从下方选几首作品，开始整理这张专辑。</p>';
 $('#album-song-choices').innerHTML=allTracks().filter(t=>!t.type||t.type==='songs').map(t=>`<label class="song-choice"><input type="checkbox" data-choose-song="${esc(t.id)}" ${a.tracks.includes(t.id)?'checked':''}><span>${esc(t.title)}</span><small>${esc(t.artist)}</small></label>`).join('');
}

const nativeAudio=new Audio();nativeAudio.preload='metadata';nativeAudio.volume=.55;
const sound=new SoundEngine();let current=seeds[0],playing=false,elapsed=0,startedAt=0,operation=0,shuffled=false,repeating=false,previousVolume=55;
const playbackClock=createPlaybackClock(updatePlayerProgress);
const playerLyrics=initPlayerLyrics({seek:seconds=>{elapsed=seconds;if(current.audioURL)nativeAudio.currentTime=seconds;if(playing)playTrack(current.id,false);else updatePlayerProgress();}});
function refreshPlayer() {
 $('#player-title').textContent=current.title;$('#player-artist').textContent=current.artist+(current.uploaded?' · 云端素材':current.audioURL?' · AI 生成':' · 演示音轨');$('#player-cover').src=artworkURL(current.art);$('#player-cover').alt=current.title+' 封面';$('#duration').textContent=time(current.duration);$('#play').innerHTML=icon(playing?'pause':'play');$('#play').setAttribute('aria-label',playing?'暂停':'播放');$('#player-like').setAttribute('aria-pressed',String(state.liked.includes(current.id)));
 playerLyrics.update(current,playing,position());
 songPreview?.syncPlayback();
}
function refreshListPlayback() {
 // Playback changes must preserve cards, open menus, focus and entrance animations.
 $$('[data-play]').forEach(button=>{
  const active=playing&&current.id===button.dataset.play,name=active?'pause':'play';
  const idleLabel=button.dataset.playIdleLabel||(button.getAttribute('aria-label')||'播放').replace(/^暂停(?=\s|$)/,'播放');
  button.dataset.playIdleLabel=idleLabel;
  if(button.querySelector('use')?.getAttribute('href')!=='#i-'+name)button.innerHTML=icon(name)+(button.dataset.playText?'<span>'+esc(button.dataset.playText)+'</span>':'');
  const label=active?idleLabel.replace(/^(播放|预览)(?=\s|$)/,'暂停'):idleLabel;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  button.closest('.track-card')?.classList.toggle('is-playing',active);
 });
 $$('[data-like]').forEach(button=>{
  const liked=state.liked.includes(button.dataset.like);
  button.setAttribute('aria-pressed',String(liked));
  const label=button.getAttribute('aria-label')||'';
  button.setAttribute('aria-label',label.replace(/^(取消收藏|收藏)/,liked?'取消收藏':'收藏'));
 });
}
function refreshPlaying() { if(view==='uploads')uploadManager?.refresh();playbackClock.setPlaying(playing);updatePlayerProgress();refreshPlayer();refreshListPlayback(); }
function position() { return current.audioURL?nativeAudio.currentTime||elapsed:Math.min(current.duration,elapsed+(playing?(performance.now()-startedAt)/1000:0)); }
function pause() { elapsed=position();playing=false;operation++;sound.stop();nativeAudio.pause();refreshPlaying(); }
async function playTrack(id,toggle=true) {
 const t=findTrack(id);if(!t)return;
 if(t.type==='abc'&&!t.audioURL){
  const draft=state.drafts.find(d=>d.id===id);if(draft?.abcOutput!=='audio')return;
  const request=++operation;
  try{const audio=await abcControls.synthesize(draft);if(request!==operation)return;const entry={url:URL.createObjectURL(audio.wav),duration:audio.duration};abcAudioCache.set(id,entry);t.audioURL=entry.url;t.duration=entry.duration;}
  catch(error){toast(error.message);return;}
 }
 if(t.type&&t.type!=='songs'&&!t.audioURL){toast('此结果仍为流程预览，真实模型将在后续接入。');return;}
 if(t.id===current.id&&playing&&toggle){pause();return;}
 if(t.id!==current.id){pause();elapsed=0;current=t;nativeAudio.removeAttribute('src');}
 if(elapsed>=current.duration)elapsed=0;
 const ticket=++operation;
 try{
  if(current.audioURL){sound.stop();if(nativeAudio.getAttribute('src')!==current.audioURL)nativeAudio.src=current.audioURL;nativeAudio.currentTime=elapsed;await nativeAudio.play();}
  else{nativeAudio.pause();if(!await sound.start(current,elapsed))return;}
  if(ticket!==operation)return;playing=true;startedAt=performance.now();refreshPlaying();
 }catch{if(ticket!==operation)return;playing=false;playbackClock.setPlaying(false);refreshPlayer();toast('音频暂时无法播放，请重试。');}
}
nativeAudio.addEventListener('loadedmetadata',()=>{if(current.audioURL&&Number.isFinite(nativeAudio.duration)){current.duration=nativeAudio.duration;refreshPlayer();updatePlayerProgress();}});
nativeAudio.addEventListener('error',()=>{if(current.audioURL){pause();toast('云端音频读取失败，请稍后重试。');}});
function finishTrack(){
 pause();
 if(view==='create'||view==='uploads'||view==='trash'){elapsed=current.duration;updatePlayerProgress();return;}
 elapsed=0;repeating?playTrack(current.id,false):nextTrack();
}
nativeAudio.addEventListener('ended',finishTrack);

function nextTrack(direction=1) { const album=state.albums.find(a=>a.id===albumView);const pool=album?album.tracks.map(findTrack).filter(Boolean):seeds;if(!pool.length)return;const index=pool.findIndex(t=>t.id===current.id);const next=shuffled?Math.floor(Math.random()*pool.length):(index+direction+pool.length)%pool.length;elapsed=0;playTrack(pool[next].id,false); }
function toggleLike(id) { state.liked=state.liked.includes(id)?state.liked.filter(item=>item!==id):[...state.liked,id];persist();refreshPlaying(); }
$('#play').addEventListener('click',()=>playing?pause():playTrack(current.id,false));$('#player-like').addEventListener('click',()=>toggleLike(current.id));$('#prev').addEventListener('click',()=>nextTrack(-1));$('#next').addEventListener('click',()=>nextTrack());
$('#seek').addEventListener('input',e=>{elapsed=Number(e.target.value)/100*current.duration;if(current.audioURL)nativeAudio.currentTime=elapsed;if(playing)playTrack(current.id,false);else updatePlayerProgress();});
$('#volume').addEventListener('input',e=>{sound.setVolume(Number(e.target.value)/100);nativeAudio.volume=Number(e.target.value)/100;e.target.style.setProperty('--progress',e.target.value+'%');$('#mute').setAttribute('aria-label',Number(e.target.value)?'静音':'取消静音');});
$('#mute').addEventListener('click',()=>{const r=$('#volume');if(Number(r.value)){previousVolume=Number(r.value);r.value=0;}else r.value=previousVolume;r.dispatchEvent(new Event('input'));});
$('#shuffle').addEventListener('click',e=>{shuffled=!shuffled;e.currentTarget.setAttribute('aria-pressed',String(shuffled));e.currentTarget.classList.toggle('enabled',shuffled);});$('#repeat').addEventListener('click',e=>{repeating=!repeating;e.currentTarget.setAttribute('aria-pressed',String(repeating));e.currentTarget.classList.toggle('enabled',repeating);});
function updatePlayerProgress(){const p=position(),progress=p/current.duration*100;$('#current-time').textContent=time(p);$('#seek').value=progress;$('#seek').style.setProperty('--playhead',progress+'%');playerLyrics.update(current,playing,p);if(playing&&!current.audioURL&&p>=current.duration)finishTrack();}
window.addEventListener('pagehide',e=>{pause();if(!e.persisted){playbackClock.destroy();playerLyrics.destroy();}});

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{albumEdit=null;albumView=null;navigate(b.dataset.view);}));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{setMode(b.dataset.mode);updateFormStatus();}));
$$('[data-type]').forEach(b=>b.addEventListener('click',()=>{setCreationType(b.dataset.type);updateFormStatus();}));
function keyboardTabs(selector,attribute) { $$(selector).forEach(button=>button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const list=$$(selector).filter(b=>!b.disabled);const index=list.indexOf(button);const target=e.key==='Home'?list[0]:e.key==='End'?list.at(-1):list[(index+(e.key==='ArrowLeft'?-1:1)+list.length)%list.length];target.click();target.focus();})); }
keyboardTabs('[data-view]');keyboardTabs('[data-mode]');keyboardTabs('[data-type]');keyboardTabs('[data-speech-mode]');keyboardTabs('[data-voice-source]');keyboardTabs('[data-abc-flow]');
$$('[data-speech-mode]').forEach(b=>b.addEventListener('click',()=>{$('#speech-model').value=b.dataset.speechMode;refreshSpeechMode();updateFormStatus();}));
$('#model').addEventListener('change',updateFormStatus);
$('#speech-model').addEventListener('change',refreshSpeechMode);$('#tts-model').addEventListener('change',refreshSpeechMode);$('#sounds-model').addEventListener('change',refreshSoundsMode);
$$('[data-speech-preset]').forEach(b=>b.addEventListener('click',()=>{$('#speech-text').value=b.dataset.speechPreset==='story'?'当最后一束阳光掠过海面，城市的喧嚣终于安静下来。我们沿着海岸慢慢走，听风把故事说完。':'嗨，欢迎回来。今天也为自己留一点时间，听听喜欢的声音，慢慢开始新的一天。';updateFormStatus();}));
const soundPresets={rain:'细密雨滴落在宽大的树叶上，远处有一声低沉雷鸣，偶尔传来鸟叫。湿润、开阔的雨林环境，声音自然流动。',engine:'一辆摩托车点火启动，发动机从低沉怠速逐渐加速，伴随短促机械振动，近距离录音，干净背景。','sci-fi':'一束能量从远处快速掠过，低频逐渐上升，明亮的金属闪光与短促爆发收尾。未来感、宽阔立体声。'};
$$('[data-sound-preset]').forEach(b=>b.addEventListener('click',()=>{$('#sound-prompt').value=soundPresets[b.dataset.soundPreset];updateFormStatus();}));
$('#speech-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;referenceUploading=true;$('#speech-file-name').textContent='正在上传 · '+file.name;try{const id='speech-source-'+crypto.randomUUID();await storeAudio(id,file);speechSourceID=id;speechReference=file.name;$('#speech-file-name').textContent='云端音频 · '+speechReference;updateFormStatus();}catch(error){e.target.value='';$('#speech-file-name').textContent=speechReference?'已保留 · '+speechReference:'上传失败，请重新选择。';toast(error.message);}finally{referenceUploading=false;}});
$('#sound-video').addEventListener('change',e=>{soundReference=e.target.files[0]?.name||'';$('#sound-video-name').textContent=soundReference?'本地参考 · '+soundReference:'根据画面里的动作与环境，设计同步声音。';updateFormStatus();});
$('#explore-search').addEventListener('input',e=>{exploreQuery=e.target.value;renderExplore();});
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{exploreFilter=b.dataset.filter;$$('[data-filter]').forEach(option=>option.classList.toggle('active',option===b));renderExplore();}));
$('#new-idea').addEventListener('click',startNew);$('#composer-form').addEventListener('submit',e=>{e.preventDefault();generatePreview();});
$('#composer-form').addEventListener('input',()=>{updateFormStatus();$('#editing-label').textContent=editingId?'编辑中 · 未保存修改':'灵感已保留在本地';});$('#composer-form').addEventListener('change',updateFormStatus);$('#instrumental').addEventListener('change',refreshInstrumental);
$('#abc-instrumental').addEventListener('change',refreshABCWritingOptions);
let aiBriefSignature=null;
let aiWritingRevision=0;
$$('[data-clear-style]').forEach(button=>button.addEventListener('click',()=>{const field=$('#'+button.dataset.clearStyle);field.value='';aiWritingRevision++;aiBriefSignature=null;field.dispatchEvent(new Event('input',{bubbles:true}));updateFormStatus();field.focus({preventScroll:true});toast('音乐风格已清空。');}));
$$('[data-clear-writing]').forEach(button=>button.addEventListener('click',()=>{
 const fields=button.dataset.clearWriting==='abc'?['abc-lyrics','abc-prompt']:['song-description','lyrics','style-prompt'];
 fields.forEach(id=>$('#'+id).value='');
 aiWritingRevision++;aiBriefSignature=null;
 updateFormStatus();$('#editing-label').textContent=editingId?'编辑中 · 未保存修改':'歌词与风格已清空';
 toast('歌词和音乐风格已清空。');
}));
const musicSignature=f=>JSON.stringify({description:f.description,styles:f.styles,lyrics:f.lyrics,title:f.title,instrumental:f.instrumental,backgroundMusic:f.backgroundMusic,exclude:f.mode==='simple'?'':f.exclude,gender:f.gender,language:f.language,model:f.model});
function aiContext(form,includeLyrics=false) {
 const context={description:form.description.slice(0,500),styles:form.styles,title:form.title,exclude:form.mode==='simple'?'':form.exclude,instrumental:form.instrumental,backgroundMusic:form.backgroundMusic,gender:form.gender,musicModel:form.type==='songs'?form.model:undefined,requestedBpm:form.type==='songs'?form.requestedBpm:undefined,keyscale:form.type==='songs'?form.keyscale:undefined,timesignature:form.type==='songs'?form.timesignature:undefined,language:form.type==='songs'?(form.language||'zh'):'auto',mood:form.ttsModel==='index-tts'?form.speechMood:'calm'};
 if(includeLyrics)context.lyrics=form.lyrics;
 return context;
}
async function applyAIText(button,{action,field,kind='songs',target='description'}) {
 if(busy||isAssistantBusy())return;
 const original=$('#'+field).value;
 if(action==='polish'&&!original.trim()){toast('先填写内容，再让 AI 润色。');$('#'+field).focus({preventScroll:true});return;}
 const form=readForm();const snapshot=JSON.stringify(form);const writingRevision=aiWritingRevision;
 const simpleLyrics=field==='song-description';
 const abcWriting=field==='abc-lyrics'||field==='abc-prompt';
 if(kind==='songs'&&target==='lyrics'&&(abcWriting?form.abcInstrumental:creationType==='songs'&&form.instrumental)){toast('纯音乐模式不需要歌词。');return;}
 const contextForm=abcWriting?{...form,mode:'simple',description:form.abcLyrics,lyrics:form.abcLyrics,styles:form.abcPrompt,instrumental:form.abcInstrumental,backgroundMusic:form.abcBackgroundMusic,exclude:'',gender:form.abcGender}:field==='lyrics'?{...form,description:original.trim()?original.slice(0,500):form.description}:form;
 const inspirationLyrics=simpleLyrics||field==='abc-lyrics';
 const requestAction=kind==='songs'&&(action==='lyrics'||(inspirationLyrics&&action==='polish'&&!isSongLyrics(original)))?'brief':action;
 try {
   await withAIButton(button,action==='polish'?'润色中…':'构思中…',async()=>{
     toast(action==='polish'?'AI 正在润色内容…':'AI 正在构思…');
     const text=requestAction==='brief'?original.slice(0,500):action==='polish'?original:action==='styles'?contextForm.styles:contextForm.description.slice(0,500);
     const context=aiContext(contextForm,action==='lyrics'||target==='lyrics'||target==='styles'||action==='styles');
     if(action==='lyrics'){delete context.styles;delete context.title;}
     const result=await requestAssistant({action:requestAction,kind,target,text,context});
     if(writingRevision!==aiWritingRevision||JSON.stringify(readForm())!==snapshot){toast('你已修改创作内容，保留了新的输入。');return;}
     $('#'+field).value=requestAction==='brief'?result.lyrics:result.text;
     if(simpleLyrics)$('#lyrics').value=$('#'+field).value;
     if(requestAction==='brief'){$(abcWriting?'#abc-prompt':'#style-prompt').value=result.styles;$('#song-title').value=result.title;}
     updateFormStatus();$('#editing-label').textContent=editingId?'编辑中 · AI 已更新':'AI 已完成 · 可继续调整';
     toast(requestAction==='brief'?(abcWriting?'歌词、音乐风格和乐谱名称已重新生成。':'歌词、音乐风格和歌曲名称已重新生成。'):action==='polish'?'润色完成，可以继续调整。':action==='lyrics'?'原创歌词已填入。':'新的灵感已填入。');
   });
 }catch(error){toast(error.message);}
 finally {refreshInstrumental();}
}
const aiFields={'song-description':['songs','lyrics'],'style-prompt':['songs','styles'],lyrics:['songs','lyrics'],'voice-description':['speech','voice-description'],'sound-prompt':['sounds','sounds'],'abc-prompt':['songs','styles'],'abc-lyrics':['songs','lyrics']};
$$('[data-ai-polish]').forEach(button=>button.addEventListener('click',()=>{const field=button.dataset.aiPolish;const [kind,target]=aiFields[field];applyAIText(button,{action:'polish',field,kind,target});}));
$$('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p=presets[b.dataset.preset];$('#song-description').value=p.description;$('#style-prompt').value=p.styles;updateFormStatus();}));
$$('[data-style]').forEach(b=>b.addEventListener('click',()=>{const field=$('#'+(b.dataset.styleTarget||'style-prompt'));const value=b.dataset.style;const styles=field.value.split(',').map(s=>s.trim()).filter(Boolean);if(!styles.includes(value))styles.push(value);field.value=styles.join(', ');updateFormStatus();}));
$('#random-style').addEventListener('click',event=>applyAIText(event.currentTarget,{action:'styles',field:'style-prompt',target:'styles'}));
$('#random-abc-style').addEventListener('click',event=>applyAIText(event.currentTarget,{action:'styles',field:'abc-prompt',target:'styles'}));
$('#write-abc-lyrics').addEventListener('click',event=>applyAIText(event.currentTarget,{action:'lyrics',field:'abc-lyrics',target:'lyrics'}));

$('#translate-lyrics').addEventListener('click',async event=>{
 if(busy||isAssistantBusy()||$('#instrumental').checked)return;
 const field='song-description',text=$('#'+field).value.trim(),language=$('#lyric-language').value;
 if(!text){toast('先填写需要翻译的歌词。');$('#'+field).focus();return;}
 const snapshot=JSON.stringify(readForm()),revision=aiWritingRevision;
 try{
  await withAIButton(event.currentTarget,'翻译中…',async()=>{
   const result=await requestAssistant({action:'translate',kind:'songs',target:'lyrics',text,context:{language}});
   if(revision!==aiWritingRevision||JSON.stringify(readForm())!==snapshot){toast('输入已修改，保留了新的内容。');return;}
   $('#lyrics').value=result.text;$('#song-description').value=result.text;
   updateFormStatus();aiBriefSignature=musicSignature(readForm());
   toast('歌词已翻译为'+$('#lyric-language').selectedOptions[0].text+'。');
  });
 }catch(error){toast(error.message);}
 finally{refreshInstrumental();}
});
$('#write-simple-lyrics').addEventListener('click',event=>applyAIText(event.currentTarget,{action:'lyrics',field:'song-description',target:'lyrics'}));
window.addEventListener('sanzo-cloud-update',event=>{if(event.detail.namespace==='training'){refreshSongModels();updateFormStatus();}});

document.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.notice)toast(target.dataset.notice);
 if(target.hasAttribute('data-play'))playTrack(target.dataset.play);
 if(target.hasAttribute('data-download-music')){const track=findTrack(target.dataset.downloadMusic);if(track?.audioURL)downloadMusic(track,toast);}
 if(target.hasAttribute('data-like'))toggleLike(target.dataset.like);
 if(target.hasAttribute('data-action')){trackAction(target.dataset.action,target.dataset.id);target.closest('details')?.removeAttribute('open');}
 if(target.hasAttribute('data-edit-draft'))loadDraft(target.dataset.editDraft);
 if(target.hasAttribute('data-follow')){const active=target.getAttribute('aria-pressed')==='true';target.setAttribute('aria-pressed',String(!active));target.textContent=active?'关注':'已关注';toast(active?'已取消关注示例创作者。':'已关注示例创作者。');}
 if(target.hasAttribute('data-new-album'))startAlbumEdit();
 if(target.hasAttribute('data-open-album')){albumView=target.dataset.openAlbum;albumEdit=null;renderLibrary();}
 if(target.hasAttribute('data-edit-album'))startAlbumEdit(target.dataset.editAlbum);
 if(target.hasAttribute('data-albums-back')){albumView=null;albumEdit=null;renderLibrary();}
 if(target.hasAttribute('data-cancel-album')){albumEdit=null;renderLibrary();}
 if(target.hasAttribute('data-cancel-pending')){pendingTrack=null;renderLibrary();}
 if(target.hasAttribute('data-add-to-album')){const a=state.albums.find(a=>a.id===target.dataset.addToAlbum);if(a&&pendingTrack){if(!a.tracks.includes(pendingTrack))a.tracks.push(pendingTrack);a.updated='刚刚编辑';persist();pendingTrack=null;renderLibrary();toast('作品已加入专辑。');}}
 if(target.hasAttribute('data-play-album')){const a=state.albums.find(a=>a.id===target.dataset.playAlbum);if(a?.tracks.length)playTrack(a.tracks[0],false);}
 if(target.hasAttribute('data-album-cover')&&albumEdit){albumEdit.art=target.dataset.albumCover;$('#album-cover-preview').src=artworkURL(albumEdit.art);$$('[data-album-cover]').forEach(b=>b.setAttribute('aria-pressed',String(b===target)));}
 if(target.hasAttribute('data-remove-song')&&albumEdit){albumEdit.tracks=albumEdit.tracks.filter(id=>id!==target.dataset.removeSong);renderAlbumSongs();}
 if(target.hasAttribute('data-move-song')&&albumEdit){const i=albumEdit.tracks.indexOf(target.dataset.moveSong),j=i+Number(target.dataset.direction);if(j>=0&&j<albumEdit.tracks.length){[albumEdit.tracks[i],albumEdit.tracks[j]]=[albumEdit.tracks[j],albumEdit.tracks[i]];renderAlbumSongs();}}
});
document.addEventListener('change',e=>{if(e.target.matches('[data-choose-song]')&&albumEdit){const id=e.target.dataset.chooseSong;if(e.target.checked){if(!albumEdit.tracks.includes(id))albumEdit.tracks.push(id);}else albumEdit.tracks=albumEdit.tracks.filter(item=>item!==id);renderAlbumSongs();}});
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1),false));
window.addEventListener('sanzo-cloud-update',event=>{
 if(event.detail.namespace!=='workspace')return;
 const latest=event.detail.data;for(const field of ['generationSeen','drafts','albums','liked','workspaces','voiceLibrary'])if(Array.isArray(latest[field]))state[field]=latest[field];
 if(view==='library'&&!albumEdit)renderLibrary();renderDrafts();refreshPlayer();
});
const collections=initCollections({state,persist,toast,render:renderDrafts,onPlay:(id,toggle)=>playTrack(id,toggle),materialById:id=>uploadManager?.has(id),removeMaterial:id=>uploadManager?.remove(id),onMove:(id,target)=>{if(editingId===id){$('#draft-workspace').value=target;state.form.workspace=target;}},editingRemoved:id=>{if(editingId===id){editingId=null;$('#editing-label').textContent='新的灵感';}if(current.id===id&&playing)pause();},onPurge:ids=>{if(ids.has(current.id)){sound.stop();nativeAudio.pause();playing=false;elapsed=0;operation++;current=seeds[0];refreshPlayer();}}});
const speechControls=initSpeechControls({state,toast,onChange:updateFormStatus});
function saveABCResult(form,output) {
 const label=abcOutputLabel(output),base=(form.title.trim().replace(/ · (?:ABC 乐谱|简谱|五线谱|ABC 合成音乐|AI 编曲设想)$/,'')||form.abcNotation.match(/^T:\s*(.+)$/m)?.[1]||'新的旋律').slice(0,48);
 const title=base+' · '+label;
 const draft={id:'score-'+crypto.randomUUID(),type:'abc',title,description:form.abcPrompt||'按 ABC 乐谱的音高与节奏'+(output.abcOutput==='audio'?'合成':'排版'),lyrics:form.abcInstrumental?'':form.abcLyrics,styles:form.abcPrompt,workspace:form.workspace,art:'liquid-glass.png',kind:'draft',updated:'刚刚保存',form:{...form,title},...output};
 state.drafts.unshift(draft);persist();collections.showAll();renderDrafts();return draft;
}
async function generateABC(form) {
 if(!form.abcLyrics.trim()&&!form.abcPrompt.trim())throw Error('填写一句灵感、歌词或音乐风格，再生成 ABC 与音乐。');
 if(!form.abcInstrumental&&(!isSongLyrics(form.abcLyrics)||!form.abcPrompt.trim())||form.abcInstrumental&&!form.abcPrompt.trim()){
  const snapshot=JSON.stringify(readForm());
  const result=await requestAssistant({action:'brief',kind:'songs',text:(form.abcLyrics||form.abcPrompt).slice(0,500),context:{...aiContext({...form,description:form.abcLyrics,lyrics:form.abcLyrics,styles:form.abcPrompt,instrumental:form.abcInstrumental,gender:form.abcGender}),musicModel:'yue2'}});
  if(JSON.stringify(readForm())!==snapshot)throw Error('创作内容已改变，请重新生成。');
  $('#abc-lyrics').value=result.lyrics;$('#abc-prompt').value=result.styles;
  if(!form.title.trim())$('#song-title').value=result.title;
  updateFormStatus();form=readForm();
 }
 await generateMusic({...form,model:'yue2-abc',abcNotation:undefined,lyrics:form.abcInstrumental?'':form.abcLyrics,styles:form.abcPrompt,description:form.abcLyrics,instrumental:form.abcInstrumental,gender:form.abcGender,songRvcModel:'',songLoraModel:'',workspace:form.workspace==='default'?'abc':form.workspace});
}
const abcControls=initABCControls({readForm,onChange:updateFormStatus,onRefresh:refreshABCWritingOptions,onSave:saveABCResult,onGenerate:generateABC,listDrafts:()=>state.drafts,findDraft:id=>state.drafts.find(d=>d.id===id),onEdit:loadDraft,toast,beforePlay:()=>{if(playing)pause();}});
fillForm(state.form);
try {
 const briefText=sessionStorage.getItem('sanzo-pending-brief');
 if(briefText){
   sessionStorage.removeItem('sanzo-pending-brief');
   const brief=JSON.parse(briefText);const form=defaultForm();
   for(const [name,limit] of Object.entries({description:500,styles:1000,lyrics:5000,title:60}))if(typeof brief[name]==='string')form[name]=brief[name].slice(0,limit);
   if(form.lyrics.trim())form.mode='custom';
   editingId=null;fillForm(form);aiBriefSignature=musicSignature(readForm());$('#editing-label').textContent='来自首页 · AI 已构思';
   toast('歌词与风格已构思，可继续调整并生成真实音乐。');
 }else{
   const pending=sessionStorage.getItem('sanzo-pending-prompt');
   if(pending){sessionStorage.removeItem('sanzo-pending-prompt');editingId=null;fillForm({...defaultForm(),description:pending.slice(0,500)});$('#editing-label').textContent='来自首页的灵感';}
 }
}catch{}
songPreview=initSongPreview({findDraft:id=>state.drafts.find(d=>d.id===id),workspaceName:id=>collections.name(id),isPlaying:id=>playing&&current.id===id,onPlay:id=>playTrack(id),toast});
uploadManager=initUploads({toast,onPurgedAsset:result=>{for(const id of result.generationIds||[])if(!state.generationSeen.includes(id))state.generationSeen.push(id);persist();},getDrafts:()=>state.drafts,getGenerationSeen:()=>state.generationSeen,onRemoveDraft:id=>collections.move(id,'trash'),onRenameDraft:(id,title)=>{const d=state.drafts.find(d=>d.id===id);if(d){d.materialName=title;d.title=title;persist();renderDrafts();}},onChange:()=>trashManager?.render(),onPlay:id=>playTrack(id),isPlaying:id=>playing&&current.id===id,onPreviewABC:({name,text,draft})=>abcControls.showDraft(draft||{type:'abc',abcOutput:'abc',title:name,unsavedSource:true,form:{...defaultForm(),type:'abc',workspace:'abc',abcNotation:text,abcFileName:name,abcFlow:'music'}})});
trashManager=initTrash({uploads:uploadManager,getDrafts:()=>state.drafts,toast,restoreDraft:id=>{const d=state.drafts.find(d=>d.id===id);if(d){d.trashed=false;delete d.removedAt;persist();renderDrafts();}},purgeDrafts:async ids=>{
 await flushCloudState('workspace');const removed=new Set(),assets=[];let failed=0;
 for(const d of state.drafts.filter(d=>d.trashed&&ids.has(d.id))){try{if(d.assetId){try{await api('/api/assets/'+encodeURIComponent(d.assetId),{method:'DELETE'});}catch(error){if(error.status!==404)throw error;}assets.push(d.assetId);}removed.add(d.id);if(d.jobId&&!state.generationSeen.includes(d.jobId))state.generationSeen.push(d.jobId);}catch{failed++;}}
 state.drafts=state.drafts.filter(d=>!removed.has(d.id));state.albums.forEach(a=>a.tracks=a.tracks.filter(id=>!removed.has(id)));state.liked=state.liked.filter(id=>!removed.has(id));uploadManager.forget(assets);
 if(removed.has(editingId)){editingId=null;$('#editing-label').textContent='新的灵感';}if(removed.has(current.id)){pause();current=seeds[0];elapsed=0;refreshPlayer();}persist();await flushCloudState('workspace');renderDrafts();if(failed)throw Error(failed+' 项作品未能清理，已保留在回收站，可稍后重试。');
}});
refreshPlayer();navigate(['explore','create','library','uploads','trash','materials','materials-trash'].includes(location.hash.slice(1))?location.hash.slice(1):'create',false);
initWorkspaceMotion();

// Optional browser tools operate only on this local prototype state.
if(document.modelContext?.registerTool){
 const lifetime=new AbortController();
 const tools=[{name:'list_music',title:'浏览音乐',description:'Read the prototype tracks and drafts. No external music service is used.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({tracks:allTracks().map(t=>({id:t.id,title:t.title,artist:t.artist})),drafts:state.drafts.length,albums:state.albums.length})},{name:'open_music_creator',title:'打开独立创作页面',description:'Focus the full-page composer and optionally stage a prompt without creating audio.',inputSchema:{type:'object',properties:{prompt:{type:'string',maxLength:500}},additionalProperties:false},execute:input=>{if(input.prompt){setCreationType('songs');$('#song-description').value=String(input.prompt).slice(0,500);setMode('simple');updateFormStatus();}navigate('create');$('#song-description').focus();return{status:'composer-ready',prototype:true};}}];
 tools.forEach(t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifetime.signal})).catch(()=>{});}catch{}});window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
}

// Restore cloud generation records independently of the draft document.

function applyMusicJob(job) {
 if(job.input.model==='cover-inference')return false;
 const existing=state.drafts.find(d=>d.jobId===job.id);
 if(!existing&&state.generationSeen.includes(job.id))return;
 const type=job.input.model==='yue2-abc'?'abc':job.input.type==='speech'||job.input.model==='qwen-voice-design'?'speech':'songs';
 const signature=JSON.stringify([job.status,job.assetId||null,job.error||null,!!job.published,existing?.materialName||job.input.title,job.input.referenceName||null]);
 if(existing&&existing.type===type&&JSON.stringify([existing.jobStatus,existing.assetId||null,existing.jobError||null,!!existing.published,existing.title,existing.form?.referenceName||null])===signature)return;
 if(!state.generationSeen.includes(job.id))state.generationSeen.push(job.id);
 const form={...defaultForm(),...job.input,...(job.input.model==='yue2-cover'?{model:'yue2',styles:job.input.styles||job.input.coverStyles,description:job.input.lyrics.slice(0,5000)}:{}),type,...(type==='abc'?{abcFlow:'score',abcLyrics:job.input.lyrics,abcPrompt:job.input.styles,abcNotation:job.input.abcNotation||'',abcInstrumental:job.input.instrumental,abcGender:job.input.gender}:{})};
 const data={...(type==='abc'?{abcOutput:'abc'}:{}),title:existing?.materialName||job.input.title,published:!!job.published,jobId:job.id,jobStatus:job.status,jobError:job.error,assetId:job.assetId,kind:job.assetId?'generated':'draft',updated:generationStatus[job.status]||'生成中'};
 if(existing)Object.assign(existing,data,{type,form,...(type==='speech'&&existing.workspace==='default'?{workspace:'speech'}:{})});
 else state.drafts.unshift({id:'generation-'+job.id,type,title:job.input.title,description:job.input.description,lyrics:job.input.lyrics,styles:job.input.styles||job.input.coverStyles||'',mode:job.input.mode,workspace:state.workspaces.some(w=>w.id===job.input.workspace)?job.input.workspace:'default',art:coverRecords.get('song:'+job.id)?.art||'liquid-glass.png',form,...data});
 return true;
}
function applyMusicJobs(jobs){
 let changed=false;for(const job of jobs)changed=applyMusicJob(job)||changed;
 if(changed){persist();if(view==='create')renderDrafts();else if(view==='uploads')uploadManager?.refresh();else if(view==='trash')trashManager?.render();}
}
const musicTaskPoller=createTaskPoller({
 fetchJobs:async()=>(await generationRequest()).jobs,
 syncJob:async job=>(await generationRequest('/'+job.id+'/sync',{})).job,
 onJobs:applyMusicJobs,onError:error=>{if(busy)toast(error.message);}
});
const musicTaskPolling=observeTaskPolling(musicTaskPoller);
async function generateMusic(form) {
 busy=true;musicSubmitting=true;$('#generate').disabled=true;$('#generate').classList.add('is-generating');$('#generate').setAttribute('aria-busy','true');$('#generate span').textContent='正在创作';$$('[data-type]').forEach(b=>b.disabled=true);
 refreshGenerationFeedback();
 const scopeChanged=collections.showAll();if(view!=='create')navigate('create');else if(scopeChanged)renderDrafts();
 const speech=form.type==='speech';
 const submission={...form,...(speech?{model:form.speechModel==='tts'?(form.ttsModel==='index-tts'?'index-voice-clone':'qwen-voice-clone'):'qwen-voice-design'}:{}),requestKey:crypto.randomUUID()};
 try{
  const {job}=await generationRequest('',submission);musicTaskPoller.accept([job]);
  if((form.type==='songs'||form.type==='abc'&&form.abcFlow!=='music')&&['queued','running','succeeded'].includes(job.status))coverControls.generate({type:'song',id:job.id},true);
  toast(job.status==='failed'||job.status==='unknown'?job.error:'任务已提交，生成结果会自动保存到云端。');
  musicTaskPolling.wake();
 }catch(error){toast(error.message+' 可刷新查看任务记录，本站不会自动重提。');}
 finally{busy=false;musicSubmitting=false;$('#generate').disabled=creationType==='sounds'&&!WOOSH_AVAILABLE;$('#generate').classList.remove('is-generating');$('#generate').removeAttribute('aria-busy');$('#generate span').textContent=creationType==='speech'?'生成语音':'创作音乐';$$('[data-type]').forEach(b=>b.disabled=false);refreshGenerationFeedback();if(creationType==='abc')abcControls.refresh();}
}
function refreshMusicCapabilities() {
 const connected=['ace-step','minimax-music','yue2'].includes($('#model').value);
 $('#song-models-help').textContent=connected?'当前工作流使用固定基础模型，RVC 和 LoRA 暂未接入。':'不选择额外模型，也可以生成音乐。';
 for(const id of ['song-rvc-model','song-lora-model','weirdness','style-influence']){$('#'+id).disabled=connected||(id==='song-rvc-model'&&$('#instrumental').checked);if(connected&&['song-rvc-model','song-lora-model'].includes(id))$('#'+id).value='';}
}
refreshMusicCapabilities();
$('#model').addEventListener('change',()=>{refreshMusicCapabilities();updateFormStatus();});
musicTaskPolling.start();

const publicationBusy=new Set();
async function publishCreation(draft){
 if(publicationBusy.has(draft.id))return;
 publicationBusy.add(draft.id);
 const wasPublished=draft.published;
 try{
  wasPublished?await unpublishSong(draft.jobId):await publishSong(draft.jobId);
  draft.published=!wasPublished;persist();renderDrafts();
  toast(wasPublished?'已取消发布，歌曲保留在我的创作中。':'单曲已发布，可以前往探索音乐聆听。');
 }catch(error){toast(error.message);}finally{publicationBusy.delete(draft.id);}
}
loadPublishedTracks().then(list=>{seeds.push(...list.filter(t=>!seeds.some(s=>s.id===t.id)));if(view==='library')renderLibrary();}).catch(()=>{});

function applyCovers(covers){
 let changed=false;
 for(const cover of covers){
  coverRecords.set(cover.targetType+':'+cover.targetId,cover);
  const record=cover.targetType==='song'?state.drafts.find(d=>(d.jobId||d.id)===cover.targetId):state.albums.find(a=>a.id===cover.targetId);
  if(record&&(record.art!==cover.art||record.coverStatus!==cover.status)){record.art=cover.art;record.coverStatus=cover.status;changed=true;}
  if(cover.targetType==='album'&&albumEdit?.id===cover.targetId){albumEdit.art=cover.art;const img=$('#album-cover-preview');if(img)img.src=artworkURL(cover.art);}
 }
 if(changed){persist();renderDrafts();if(view==='library'&&!albumEdit)renderLibrary();const d=state.drafts.find(d=>d.id===current.id);if(d){current.art=d.art;refreshPlayer();}}
}
const coverControls=initCoverControls({toast,apply:applyCovers,describe:(id,type)=>{
 if(type==='song')return state.drafts.find(d=>d.id===id);
 if(type==='album'&&albumEdit)return {...albumEdit,styles:state.drafts.filter(d=>albumEdit.tracks.includes(d.id)).map(d=>d.styles||'').join(', ')};
},resolve:async(id,type)=>{
 if(type==='song'){const draft=state.drafts.find(d=>d.id===id);if(!draft)return;await flushCloudState('workspace');return {type,id:draft.jobId||draft.id};}
 if(type==='album'&&albumEdit){albumEdit.id=albumEdit.id||'album-'+crypto.randomUUID();const index=state.albums.findIndex(a=>a.id===albumEdit.id);const saved={...albumEdit,tracks:[...albumEdit.tracks]};if(index<0)state.albums.unshift(saved);else state.albums[index]=saved;persist();await flushCloudState('workspace');return {type,id:albumEdit.id};}
}});

// Track the actual panel edge across responsive layouts and sidebar collapse.
const composerDockObserver=new ResizeObserver(()=>{
 const panel=$('.composer-panel');
 document.documentElement.style.setProperty('--composer-clear-left',Math.ceil(panel.getBoundingClientRect().right+24)+'px');
});
composerDockObserver.observe($('.composer-panel'));
composerDockObserver.observe($('.workspace-layout'));
window.addEventListener('pagehide',()=>composerDockObserver.disconnect(),{once:true});
