import { initWorkspaceMotion } from '/workspace-motion.js';
import { storeAudio, audioURL } from '/training-audio-store.js';
import { initTrainingPlayer } from '/training-player.js';
import { openCloudState, saveCloudState } from '/cloud-state.js';
import {requireSignIn} from './auth-session.js';
const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
const clock=n=>Number.isFinite(n)?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'待识别';
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
const label=kind=>kind==='voice'?'RVC 音色模型':'YUE2 曲风 LoRA';
const storeKey='sanzo-training-v1';
const sampleAssets=[
 ['v1','Luna · 清唱采样 01.wav','voice',78,13.1,true],['v2','Luna · 叙述采样.wav','voice',112,18.8,true],['v3','Luna · 低音区.wav','voice',54,9.1,true],['v4','Luna · 高音区.wav','voice',93,15.6,false],
 ['s1','Neon Dream · 主歌.wav','style',93,15.6,true],['s2','Neon Dream · 副歌.wav','style',86,14.4,true],['s3','Neon Dream · 鼓与合成器.wav','style',74,12.4,true],['s4','Neon Dream · 完整片段.wav','style',186,31.2,false]
].map(([id,name,kind,duration,mb,prepared])=>({id,name,originalName:name,kind,duration,bytes:Math.round(mb*1048576),format:'WAV',source:'demo',prepared,removed:false}));
const sampleModels=[{id:'demo-rvc',name:'Luna Voice · v1',kind:'voice',count:3,duration:244,created:'示例模型',config:{base:'RVC v2',iterations:120,preset:'standard',batch:4,pitch:'RMVPE'},source:'demo'},{id:'demo-yue',name:'Neon Dream · v1',kind:'style',count:3,duration:253,created:'示例模型',config:{base:'YUE2',iterations:1000,preset:'standard',batch:4,rank:16},source:'demo'}];
let state=await openCloudState('training');
if(!state||!Array.isArray(state.assets)||!Array.isArray(state.models)||!Array.isArray(state.tasks))state={assets:sampleAssets,models:sampleModels,tasks:sampleModels.map((m,i)=>({id:'demo-task-'+i,name:m.name,kind:m.kind,source:'demo',progress:100,status:'done',count:m.count,duration:m.duration,config:m.config,modelId:m.id}))};
state.tasks.forEach(t=>{if(t.status==='running')t.status='paused';});
const initialSelection=['voice','style'].flatMap(type=>{const own=state.assets.filter(a=>a.kind===type&&a.source==='uploaded'&&!a.removed);return (own.length?own:state.assets.filter(a=>a.kind===type&&!a.removed&&a.prepared).slice(0,3)).map(a=>a.id);});
let kind='voice',view='assets',query='',source='all',modelFilter='all',preset='standard',selected=new Set(initialSelection),editingAsset=null,detailModel=null,lastRemoved=null,uploading=false;
function paintPlayback(next){
 $$('[data-asset-row]').forEach(row=>{const active=row.dataset.assetRow===next.id;row.classList.toggle('is-current',active);row.classList.toggle('is-playing',active&&next.playing);const button=row.querySelector('.asset-icon');if(button){button.setAttribute('aria-label',(active&&next.playing?'暂停 ':'播放 ')+row.querySelector('.asset-name').textContent);button.querySelector('use').setAttribute('href',active&&next.playing?'#i-pause':'#i-play');}});
}
const materialPlayer=initTrainingPlayer({findAsset:id=>state.assets.find(a=>a.id===id),listAssets:()=>state.assets,getAudioURL:audioURL,onError:message=>toast(message),onChange:paintPlayback,onDetails:assetDetail});
function save(){saveCloudState('training',state);}
function toast(message,undo=false){$('#toast-message').textContent=message;$('#undo-remove').hidden=!undo;$('#training-toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#training-toast').classList.remove('show'),undo?10000:4500);}
const activeAssets=()=>state.assets.filter(a=>a.kind===kind&&!a.removed);
const selectedAssets=()=>activeAssets().filter(a=>selected.has(a.id));
const filteredAssets=()=>state.assets.filter(a=>a.kind===kind&&(source==='removed'?a.removed:!a.removed)&&(source==='all'||source==='removed'||a.source===source)&&a.name.toLowerCase().includes(query.toLowerCase()));
function counts(){
 $('#assets-count').textContent=state.assets.filter(a=>!a.removed).length;
 $('#voice-count').textContent=String(state.assets.filter(a=>a.kind==='voice'&&!a.removed).length).padStart(2,'0');
 $('#style-count').textContent=String(state.assets.filter(a=>a.kind==='style'&&!a.removed).length).padStart(2,'0');
 $('#tasks-count').textContent=state.tasks.length;$('#models-count').textContent=state.models.length;
}
function updateSelection(){
 const chosen=selectedAssets(),total=chosen.reduce((n,a)=>n+(a.duration||0),0),filtered=filteredAssets().filter(a=>!a.removed);
 $('#selection-count').textContent='已选 '+chosen.length+' 段';
 $('#select-all').checked=!!filtered.length&&filtered.every(a=>selected.has(a.id));$('#select-all').indeterminate=filtered.some(a=>selected.has(a.id))&&!$('#select-all').checked;$('#select-all').disabled=!filtered.length;
 $('#recipe-selection').textContent=chosen.length?'已选 '+chosen.length+' 段'+(kind==='voice'?'音色':'曲风')+'素材':'选择至少一段素材';
 $('#recipe-duration').textContent=chosen.length?'总时长 '+clock(total)+(chosen.some(a=>!a.duration)?' · 部分时长待识别':''):'从左侧勾选音频，开始配置。';
 $('#start-training').disabled=!chosen.length;$('#prepare-assets').disabled=!chosen.length;$('#move-assets').disabled=!chosen.length;
 $('#dataset-summary').textContent=activeAssets().length+' 段素材 · '+clock(activeAssets().reduce((n,a)=>n+(a.duration||0),0));
}
function renderAssets(){
 const list=filteredAssets();$('#asset-empty').hidden=!!list.length;
 $('#asset-list').innerHTML=list.map(a=>'<article class="asset-row" data-asset-row="'+esc(a.id)+'"><input type="checkbox" data-select="'+esc(a.id)+'" aria-label="选择 '+esc(a.name)+'" '+(selected.has(a.id)&&!a.removed?'checked ':'')+(a.removed?'disabled':'')+'><button class="asset-icon" data-play-asset="'+esc(a.id)+'" aria-label="播放 '+esc(a.name)+'" '+(a.removed?'disabled':'')+'>'+icon('play')+'</button><div><button class="asset-name" data-play-asset="'+esc(a.id)+'" title="'+esc(a.originalName)+'" '+(a.removed?'disabled':'')+'>'+esc(a.name)+'</button><div class="asset-meta"><span>'+esc(a.format)+'</span><span>· '+clock(a.duration)+'</span><span>· '+size(a.bytes)+'</span><span class="demo-tag">'+(a.source==='demo'?'示例素材':'我的上传')+'</span></div></div><span class="asset-status"><strong>'+(a.removed?'已移除':a.prepared?'已整理 · 演示':'待整理')+'</strong><span>'+(kind==='voice'?'音色采样':'曲风片段')+'</span></span><details class="asset-menu"><summary aria-label="更多操作 '+esc(a.name)+'">'+icon('more')+'</summary><div class="menu-items">'+(a.removed?'<button data-restore="'+esc(a.id)+'">恢复素材</button>':'<button data-detail-asset="'+esc(a.id)+'">详情 / 重命名</button><button data-move="'+esc(a.id)+'">移至'+(kind==='voice'?'曲风':'音色')+'</button><button data-remove="'+esc(a.id)+'">移除素材</button>')+'</div></details></article>').join('');
 updateSelection();counts();materialPlayer.refresh();
}
function chooseKind(next){
 kind=next;document.body.dataset.trainingKind=kind;
 $$('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 $('#material-title').textContent=kind==='voice'?'音色素材':'曲风素材';$('#trainer-title').textContent=label(kind);$('#base-model').textContent=kind==='voice'?'v2':'LoRA';$('#trainer-icon').setAttribute('href',kind==='voice'?'#i-voice':'#i-style');
 $('#trainer-description').textContent=kind==='voice'?'用清晰、音色一致的单人干声，建立属于你的声音。':'用风格连贯的音乐片段，让 YUE2 延续你的编曲与声音质感。';
 $('#model-name').value=kind==='voice'?'My Voice · v1':'My Style · v1';$('#iteration-label').textContent=kind==='voice'?'训练轮数 / Epochs':'训练步数 / Steps';$('#rank-field').hidden=kind!=='style';$('#pitch-field').hidden=kind!=='voice';
 $('#prepare-type').textContent=kind==='voice'?'分离人声、提取音高':'切分音乐片段、标注曲风';$('#move-assets').textContent='移至'+(kind==='voice'?'曲风':'音色');
 $('#model-reference').href=kind==='voice'?'https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI':'https://huggingface.co/m-a-p/YuE2-3B';
 applyPreset(preset);renderAssets();
}
function applyPreset(next){preset=next;$$('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===preset)));$('#iterations').value=(kind==='voice'?{light:40,standard:120,detail:240}:{light:300,standard:1000,detail:2000})[preset];$('#lora-rank').value=preset==='detail'?'32':preset==='light'?'8':'16';}
function switchView(next){view=next;$$('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});['assets','tasks','models'].forEach(id=>$('#'+id+'-view').hidden=id!==view);counts();if(view==='tasks')renderTasks();if(view==='models')renderModels();}
const taskState=t=>t.status==='done'?'已完成':t.status==='paused'?'已暂停':t.status==='cancelled'?'已取消':'进行中';
function stageNames(t){return ['整理素材',t.kind==='voice'?'提取特征':'编码片段','训练模型','导出模型'];}
function renderTasks(){
 $('#task-list').innerHTML=state.tasks.map(t=>'<article class="task-card glass" data-task="'+esc(t.id)+'" data-type="'+esc(t.kind)+'"><div class="task-topline"><span class="task-icon">'+icon(t.kind==='voice'?'voice':'style')+'</span><div><h3>'+esc(t.name)+'</h3><p>'+label(t.kind)+' · '+t.count+' 段素材 · '+clock(t.duration)+'</p></div><span class="task-badge">'+taskState(t)+' · 演示</span></div><div class="task-progress-row"><span data-stage-label>'+esc(stageNames(t)[Math.min(3,Math.floor(t.progress/25))])+'</span><span data-progress-label>'+t.progress+'%</span></div><div class="task-progress" role="progressbar" aria-label="'+esc(t.name)+' 演示进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+t.progress+'"><span style="width:'+t.progress+'%"></span></div><div class="task-stages">'+stageNames(t).map((text,i)=>'<span class="'+(t.progress>=(i+1)*25?'done':Math.floor(t.progress/25)===i?'current':'')+'"><i>'+String(i+1).padStart(2,'0')+'</i>'+text+'</span>').join('')+'</div><div class="task-bottom"><small>原型进度演示 · 不执行实际训练</small><div class="task-actions">'+(t.status==='done'?'<button data-model-detail="'+esc(t.modelId)+'">查看模型</button>':t.status==='cancelled'?'<button data-back-assets>重新配置</button>':'<button data-toggle-task="'+esc(t.id)+'">'+(t.status==='paused'?'继续演示':'暂停')+'</button><button data-cancel-task="'+esc(t.id)+'">取消任务</button>')+'</div></div></article>').join('');
}
function renderModels(){
 const list=state.models.filter(m=>modelFilter==='all'||m.kind===modelFilter);$('#models-empty').hidden=!!list.length;
 $$('[data-model-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modelFilter===modelFilter)));
 $('#model-list').innerHTML=list.map(m=>'<article class="model-card glass" data-type="'+esc(m.kind)+'"><span class="detail-tag">演示模型</span><div class="model-identity"><span>'+(m.kind==='voice'?'RVC':'LoRA')+'</span>'+icon(m.kind==='voice'?'voice':'style')+'</div><h3>'+esc(m.name)+'</h3><p>'+label(m.kind)+' · '+(m.kind==='voice'?'保留个人音色':'延续编曲与音乐质感')+'</p><div class="model-card-meta"><span>'+m.count+' 段训练素材</span><span>'+esc(m.created||'刚刚创建')+'</span></div><button class="lab-button" data-model-detail="'+esc(m.id)+'">查看模型与配置</button></article>').join('');counts();
}
function modelDetail(id){
 const m=state.models.find(x=>x.id===id);if(!m)return;detailModel=m;
 $('#model-dialog-title').textContent=m.name;
 $('#model-detail').innerHTML='<span class="detail-tag">'+label(m.kind)+' · 演示模型</span><p>训练配置已归档，可以导出以备后续接入训练服务。</p><div class="detail-grid"><div>基础模型<strong>'+esc(m.config.base)+'</strong></div><div>素材数量<strong>'+m.count+' 段 / '+clock(m.duration)+'</strong></div><div>'+(m.kind==='voice'?'训练轮数':'训练步数')+'<strong>'+m.config.iterations+'</strong></div><div>'+(m.kind==='voice'?'音高提取':'LoRA Rank')+'<strong>'+esc(m.kind==='voice'?m.config.pitch:m.config.rank)+'</strong></div><div>批次大小<strong>'+m.config.batch+'</strong></div><div>权重输出<strong>'+(m.kind==='voice'?'.pth + .index':'.safetensors')+' · 占位</strong></div></div><p class="dialog-note">此模型是训练流程的演示记录，尚无可使用的权重文件。</p>';
 $('#model-dialog').showModal();
}
function assetDetail(id){
 const a=state.assets.find(x=>x.id===id);if(!a)return;editingAsset=a;$('#asset-dialog-title').textContent='音频详情';$('#asset-name').value=a.name;
 $('#asset-detail').innerHTML='<span class="detail-tag">'+(a.kind==='voice'?'音色素材':'曲风素材')+' · '+(a.source==='demo'?'示例素材':'我的上传')+'</span><p>'+esc(a.originalName)+'</p><div class="detail-grid"><div>格式<strong>'+esc(a.format)+'</strong></div><div>时长<strong>'+clock(a.duration)+'</strong></div><div>文件大小<strong>'+size(a.bytes)+'</strong></div><div>整理状态<strong>'+(a.prepared?'已整理 · 演示':'待整理')+'</strong></div></div>'+(a.source==='demo'?'<p class="dialog-note">示例素材使用合成器演示试听。上传自己的音频后，会播放原始文件。</p>':'');
 $('#asset-detail-play').disabled=a.removed;
 $('#asset-dialog').showModal();
}
async function durationOf(file){return new Promise(resolve=>{const url=URL.createObjectURL(file),audio=new Audio();let finished=false;const done=value=>{if(finished)return;finished=true;clearTimeout(timer);audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);resolve(value);};const timer=setTimeout(()=>done(null),5000);audio.preload='metadata';audio.onloadedmetadata=()=>done(Number.isFinite(audio.duration)?audio.duration:null);audio.onerror=()=>done(null);audio.src=url;});}
async function uploadFiles(files){
 if(uploading)return;const list=[...files].slice(0,20),uploadKind=kind,newIds=[];if(!list.length)return;uploading=true;$('#upload-button').disabled=true;$('#upload-zone').disabled=true;$('#upload-button').textContent='读取音频…';let added=0,skipped=0;
 try{for(const file of list){
  const ext=file.name.split('.').at(-1).toLowerCase();if(!['wav','mp3','flac','m4a','ogg'].includes(ext)||file.size>100*1048576||!file.size){skipped++;continue;}
  if(state.assets.some(a=>!a.removed&&a.source==='uploaded'&&a.kind===uploadKind&&a.originalName===file.name&&a.bytes===file.size)){skipped++;continue;}
  const id=crypto.randomUUID(),a={id,name:file.name.slice(0,120),originalName:file.name.slice(0,200),kind:uploadKind,duration:await durationOf(file),bytes:file.size,format:ext.toUpperCase(),source:'uploaded',prepared:false,removed:false};
  try{await storeAudio(id,file,uploadKind);}catch(error){toast(error.message||'上传失败，请重试。');continue;}
  state.assets.unshift(a);newIds.push(id);added++;
 }if(added){state.assets.filter(a=>a.kind===uploadKind).forEach(a=>selected.delete(a.id));newIds.forEach(id=>selected.add(id));}save();source='uploaded';query='';$('#asset-search').value='';$('#asset-source').value=source;renderAssets();toast(added?'已加入 '+added+' 段云端音频。'+(skipped?' '+skipped+' 个重复、空文件或不支持的文件已跳过。':''):'请选择 WAV / MP3 / FLAC / M4A / OGG 音频，单文件不超过 100 MB。');}
 finally{uploading=false;$('#file-picker').value='';$('#upload-button').disabled=false;$('#upload-zone').disabled=false;$('#upload-button').innerHTML=icon('upload')+'上传音频';}
}
function removeAsset(id){const a=state.assets.find(x=>x.id===id);if(!a)return;materialPlayer.stop(id);a.removed=true;selected.delete(id);lastRemoved=id;save();renderAssets();toast('素材已移至「最近移除」。',true);}
function restoreAsset(id){const a=state.assets.find(x=>x.id===id);if(!a)return;a.removed=false;save();renderAssets();toast('素材已恢复。');}
function moveAssets(ids){const target=kind==='voice'?'style':'voice';state.assets.filter(a=>ids.includes(a.id)).forEach(a=>{a.kind=target;a.prepared=false;selected.delete(a.id);});save();renderAssets();toast('已移至'+(target==='voice'?'音色':'曲风')+'素材。');}
$('#asset-search').addEventListener('input',e=>{query=e.target.value;renderAssets();});$('#asset-source').addEventListener('change',e=>{source=e.target.value;renderAssets();});
$('#select-all').addEventListener('change',e=>{filteredAssets().filter(a=>!a.removed).forEach(a=>e.target.checked?selected.add(a.id):selected.delete(a.id));renderAssets();});
$('#asset-list').addEventListener('change',e=>{if(e.target.dataset.select){e.target.checked?selected.add(e.target.dataset.select):selected.delete(e.target.dataset.select);updateSelection();}});
$('#asset-list').addEventListener('click',e=>{if(e.target.closest('button,input,details'))return;const row=e.target.closest('[data-asset-row]');if(row)materialPlayer.playAsset(row.dataset.assetRow);});
$('#upload-button').addEventListener('click',()=>$('#file-picker').click());$('#upload-zone').addEventListener('click',()=>$('#file-picker').click());$('#file-picker').addEventListener('change',e=>uploadFiles(e.target.files));
const drop=$('#upload-zone');['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('is-dragging');}));['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('is-dragging');if(name==='drop')uploadFiles(e.dataTransfer.files);}));
$('#prepare-assets').addEventListener('click',()=>{$('#prepare-summary').textContent='对已选的 '+selectedAssets().length+' 段'+(kind==='voice'?'音色':'曲风')+'素材进行整理。';$('#prepare-dialog').showModal();});
$('#confirm-prepare').addEventListener('click',()=>{if(!$('.prepare-options input:checked')){toast('请至少选择一项整理步骤。');return;}selectedAssets().forEach(a=>a.prepared=true);save();renderAssets();$('#prepare-dialog').close();toast('素材整理演示已完成。');});
$('#move-assets').addEventListener('click',()=>moveAssets(selectedAssets().map(a=>a.id)));$('#undo-remove').addEventListener('click',()=>{if(lastRemoved)restoreAsset(lastRemoved);});
$('#rename-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#asset-name').value.trim();if(!name){$('#asset-name').value='';$('#asset-name').reportValidity();return;}if(!editingAsset)return;editingAsset.name=name.slice(0,120);save();renderAssets();$('#asset-dialog').close();toast('素材名称已更新。');});
$('#asset-detail-play').addEventListener('click',()=>{const id=editingAsset?.id;if(!id)return;$('#asset-dialog').close();materialPlayer.playAsset(id);});
$('#asset-dialog').addEventListener('close',()=>{editingAsset=null;});
$('#training-form').addEventListener('submit',async e=>{
 e.preventDefault();try{if(!await requireSignIn())return;}catch(error){toast(error.message);return;}const chosen=selectedAssets(),name=$('#model-name').value.trim();if(!name){$('#model-name').value='';$('#model-name').reportValidity();return;}if(!chosen.length)return;
 const t={id:crypto.randomUUID(),name:name.slice(0,60),kind,count:chosen.length,duration:chosen.reduce((n,a)=>n+(a.duration||0),0),assets:chosen.map(a=>({id:a.id,name:a.name})),source:'demo',status:'running',progress:0,config:{base:kind==='voice'?'RVC v2':'YUE2',iterations:Number($('#iterations').value),preset,batch:Number($('#batch-size').value),...(kind==='voice'?{pitch:$('#pitch-method').value}:{rank:Number($('#lora-rank').value)})}};
 state.tasks.unshift(t);save();switchView('tasks');toast('训练流程演示已开始。');
});
function advanceTasks(){
 let changed=false;for(const t of state.tasks){if(t.status!=='running')continue;t.progress=Math.min(100,t.progress+10);changed=true;
  if(t.progress===100){t.status='done';t.modelId=crypto.randomUUID();state.models.unshift({id:t.modelId,name:t.name,kind:t.kind,count:t.count,duration:t.duration,created:'刚刚创建',source:'demo',config:t.config,assets:t.assets});toast('演示已完成，模型已归档到「我的模型」。');if(view==='tasks')renderTasks();if(view==='models')renderModels();}
  else if(view==='tasks'){const card=$$('[data-task]').find(el=>el.dataset.task===t.id);if(card){card.querySelector('[data-progress-label]').textContent=t.progress+'%';card.querySelector('[data-stage-label]').textContent=stageNames(t)[Math.min(3,Math.floor(t.progress/25))];card.querySelector('.task-progress').setAttribute('aria-valuenow',t.progress);card.querySelector('.task-progress>span').style.width=t.progress+'%';[...card.querySelector('.task-stages').children].forEach((el,i)=>el.className=t.progress>=(i+1)*25?'done':Math.floor(t.progress/25)===i?'current':'');}}
 }if(changed){save();counts();}
}
let timer=setInterval(advanceTasks,850);
window.addEventListener('pagehide',()=>{clearInterval(timer);state.tasks.forEach(t=>{if(t.status==='running')t.status='paused';});save();});window.addEventListener('pageshow',e=>{if(e.persisted){timer=setInterval(advanceTasks,850);if(view==='tasks')renderTasks();}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view)switchView(b.dataset.view);if(b.dataset.kind)chooseKind(b.dataset.kind);if(b.dataset.preset)applyPreset(b.dataset.preset);
 if(b.hasAttribute('data-back-assets'))switchView('assets');if(b.dataset.close)$('#'+b.dataset.close).close();if(b.dataset.detailAsset)assetDetail(b.dataset.detailAsset);if(b.dataset.remove)removeAsset(b.dataset.remove);if(b.dataset.restore)restoreAsset(b.dataset.restore);if(b.dataset.move)moveAssets([b.dataset.move]);
 if(b.dataset.playAsset)materialPlayer.playAsset(b.dataset.playAsset);
 if(b.dataset.modelFilter){modelFilter=b.dataset.modelFilter;renderModels();}if(b.dataset.modelDetail)modelDetail(b.dataset.modelDetail);
 if(b.dataset.toggleTask){const t=state.tasks.find(t=>t.id===b.dataset.toggleTask);if(t){t.status=t.status==='running'?'paused':'running';save();renderTasks();}}
 if(b.dataset.cancelTask){const t=state.tasks.find(t=>t.id===b.dataset.cancelTask);if(t){t.status='cancelled';save();renderTasks();toast('演示任务已取消，可以重新配置。');}}
});
$('#export-config').addEventListener('click',()=>{if(!detailModel)return;const blob=new Blob([JSON.stringify({prototype:true,model:detailModel.name,kind:detailModel.kind,config:detailModel.config,assets:detailModel.assets||[],materialCount:detailModel.count},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=detailModel.name.replace(/[\\/:*?"<>|]/g,'').slice(0,80)+'-training.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);});
$('.lab-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=$$('[data-view]'),index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();});
window.addEventListener('sanzo-cloud-update',event=>{if(event.detail.namespace!=='training')return;const next=event.detail.data;if(!Array.isArray(next.assets)||!Array.isArray(next.tasks)||!Array.isArray(next.models))return;state=next;renderAssets();if(view==='tasks')renderTasks();if(view==='models')renderModels();});
chooseKind('voice');counts();initWorkspaceMotion();
