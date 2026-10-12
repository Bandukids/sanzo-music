import {requestAssistant,withAIButton} from '/ai-assistant.js';
import {voicePresets} from '/voice-presets.js';
import {storeAudio,audioURL,checkAudio} from '/training-audio-store.js';
import {peekCloudState,openCloudState,api,cloudStateReady} from '/cloud-state.js';
import {voiceLibrarySamples} from '/voice-library.js';
export function initSpeechControls({state,toast,onChange}){
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 state.voiceLibrary=Array.isArray(state.voiceLibrary)?state.voiceLibrary.filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string'):[];
 let clone={id:'',name:''},svc={id:'',name:''},sampleList=[],uploading=0,cloudAssets=[],assetsReady=false,libraryLoading=null,pendingVoice='',emotionSummary='',emotionSource='manual',emotionPending=false,emotionManualOverride=false;
 const presets=voicePresets;
 function library(){
  sampleList=voiceLibrarySamples(cloudStateReady('uploads')?cloudAssets:[],peekCloudState('uploads'));
  const select=$('#library-voice'),old=pendingVoice||select.value,own=sampleList.filter(a=>!a.preset);
  const options=list=>list.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+(a.demo?' · 示例':'')+'</option>').join('');
  select.innerHTML='<optgroup label="预设音色">'+options(presets)+'</optgroup>'+(own.length?'<optgroup label="我的音色样本">'+options(own)+'</optgroup>':'');
  select.value=sampleList.some(a=>a.id===old)?old:'preset:warm';
  if(assetsReady)pendingVoice='';
 }
 function preview(id,player){
  const url=id?(id.startsWith('/')?id:audioURL(id)):'';
  if(player.getAttribute('src')===url)return;
  player.pause();player.hidden=!id;player.preload='metadata';
  if(id)player.src=url;else{player.removeAttribute('src');player.load();}
 }
 function source(){
  const value=$('#voice-source').value==='upload'?'upload':'library';$('#voice-source').value=value;
  $$('[data-voice-source]').forEach(b=>{const selected=b.dataset.voiceSource===value;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  $('#voice-library').hidden=value!=='library';$('#voice-upload').hidden=value!=='upload';
  const sample=sampleList.find(a=>a.id===$('#library-voice').value);
  $('#voice-library-note').textContent=sample?.preset?'Qwen TTS 生成的预设音色，可在下方试听，也可选择自己的音色样本。':sample?.demo?'这是示例音色占位，可选择自己的云端音色样本。':'使用这段云端音色样本作为克隆参考。';
  preview(value==='upload'?clone.id:sample?.url||sample&&!sample.preset&&!sample.demo&&sample.id||'',$('#clone-preview'));
 }
 function refresh(){
  const index=$('#tts-model').value==='index-tts';$('#emotion-field').hidden=!index;$$('[data-emotion-index]').forEach(input=>input.disabled=!index);
  $('#speech-speed-field').hidden=true;$('#speech-speed').disabled=true;
  $('#clone-file').accept='.mp3,.wav,.flac';
  $('#voice-upload .media-drop span').textContent='MP3 / WAV / FLAC · 清晰单人语音，32 MB 以内';
  $('.speech-auto-language').textContent=index?'保留参考音色，按情绪组合表达':'语言自动识别';
  const conversion=$('#conversion-model').value==='svc';$('#svc-reference').hidden=!conversion;$('#rvc-target').hidden=conversion;
  $('#conversion-help').textContent=conversion?'无需训练：上传目标音色样本，转换原始音频。':'选择已训练的 RVC 音色模型，转换原始音频。';
  $('#design-count').textContent=$('#design-text').value.length+' / 3000';source();
 }
 function captions(){
  for(const [type,record] of [['clone',clone],['svc',svc]]){
   $('#'+type+'-file-name').textContent=record.name?'云端参考 · '+record.name:type==='clone'?'选择清晰的单人声音，作为克隆参考。':'原始音频提供内容，参考样本提供目标音色。';
   $('#clear-'+type).hidden=!record.id;
  }
 }
 function read(){return{emotionDescription:$('#emotion-description').value,emotionSummary,emotionSource,emotionPending,emotionManualOverride,emotionVector:$$('[data-emotion-index]').map(input=>input.value===''?0:input.valueAsNumber),speechVoice:$('#library-voice').value.startsWith('preset:')?$('#library-voice').value.slice(7):'',cloneSample:clone.id,cloneName:clone.name,svcSample:svc.id,svcName:svc.name};}
 function fill(f){
  $('#emotion-description').value=f.emotionDescription||'';emotionSummary=f.emotionSummary||'';emotionSource=f.emotionSource==='ai'?'ai':'manual';emotionManualOverride=f.emotionManualOverride===true||f.emotionSource==='manual'&&f.emotionPending!==true&&Array.isArray(f.emotionVector)&&f.emotionVector.some(v=>v>0);emotionPending=!!f.emotionDescription&&!emotionManualOverride&&(f.emotionPending===true||emotionSource!=='ai');$('#emotion-details').open=false;emotionStatus();
  $$('[data-emotion-index]').forEach((input,i)=>input.value=Array.isArray(f.emotionVector)&&f.emotionVector.length===8&&Number.isFinite(f.emotionVector[i])?Math.max(0,Math.min(1,f.emotionVector[i])):0);
  library();$('#voice-source').value=f.voiceSource==='upload'?'upload':'library';
  const voice=f.voiceSource==='preset'?'preset:'+(['warm','clear','narrator'].includes(f.speechVoice)?f.speechVoice:'warm'):f.libraryVoice;
  if(!assetsReady)pendingVoice=voice;
  $('#library-voice').value=sampleList.some(v=>v.id===voice)?voice:'preset:warm';
  clone={id:f.cloneSample||'',name:f.cloneName||''};svc={id:f.svcSample||'',name:f.svcName||''};$('#clone-file').value='';$('#svc-file').value='';captions();refresh();
  if(assetsReady&&clone.id&&!sampleList.some(a=>a.id===clone.id)){clone={id:'',name:''};captions();source();}
  if(svc.id)preview(svc.id,$('#svc-preview'));else{$('#svc-preview').pause();$('#svc-preview').hidden=true;}
 }
 async function upload(type,file){
  if(!file)return;const input=$('#'+type+'-file');
  if(!/\.(wav|mp3|flac|m4a|ogg|aac)$/i.test(file.name)&&!file.type.startsWith('audio/')){toast('请选择音频文件。');input.value='';return;}
  if(!file.size||file.size>100*1024*1024){toast('音频需小于 100 MB，且不能为空。');input.value='';return;}
  uploading++;
  try{
   const id='speech-sample-'+crypto.randomUUID();await storeAudio(id,file,type==='clone'?'upload-speech':'voice');const record={id,name:file.name};
   if(type==='clone')window.dispatchEvent(new CustomEvent('sanzo-audio-upload',{detail:{...record,kind:'upload-speech',bytes:file.size,mime:file.type,created_at:new Date().toISOString()}}));
   if(type==='clone'){clone=record;state.voiceLibrary.push(record);library();source();}else{svc=record;preview(svc.id,$('#svc-preview'));}
   captions();onChange();toast(type==='clone'?'参考音色已加入音色库，并归档到上传页面的语音素材。':'SVC 参考音色已上传到云端。');
  }catch{input.value='';toast('无法上传音频，请检查网络后重试。');}finally{uploading--;}
 }
 $$('[data-voice-source]').forEach(b=>b.addEventListener('click',()=>{$('#voice-source').value=b.dataset.voiceSource;library();source();onChange();loadLibrary();}));
 for(const field of ['tts-model','conversion-model','library-voice','design-voice'])$('#'+field).addEventListener('change',refresh);
 function emotionStatus(){ $('#emotion-status').textContent=emotionSummary||($('#emotion-description').value.trim()?'生成语音时会自动解析；也可点击 AI 解析提前查看。':'描述想要的表达，让 AI 填写情绪组合；也可以展开手动调整。'); }
 function manualEmotion(){emotionSource='manual';emotionSummary='';emotionPending=false;emotionManualOverride=true;$('#emotion-status').textContent='当前使用手动情绪组合，生成时会保存实际数值。';}
 $('#emotion-description').addEventListener('input',()=>{emotionSource='manual';emotionSummary='';emotionManualOverride=false;emotionPending=!!$('#emotion-description').value.trim();if(!emotionPending)$$('[data-emotion-index]').forEach(input=>input.value=0);$('#emotion-status').textContent=emotionPending?'生成时自动解析这段描述，也可提前点击 AI 解析。':'未填写情绪描述，默认使用八个 0。';onChange();});
 $$('[data-emotion-index]').forEach(input=>{
  input.addEventListener('input',()=>{if(Number.isFinite(input.valueAsNumber)&&(input.valueAsNumber<0||input.valueAsNumber>1)){input.value=Math.max(0,Math.min(1,input.valueAsNumber));toast('情绪强度已限制在 0–1。');}manualEmotion();onChange();});
  input.addEventListener('blur',()=>{if(!Number.isFinite(input.valueAsNumber))input.value=0;onChange();});
 });
 $('#emotion-reset').addEventListener('click',()=>{$$('[data-emotion-index]').forEach(input=>input.value=0);manualEmotion();onChange();});
 async function parseEmotion(){
  const text=$('#emotion-description').value.trim();if(!text)throw Error('先描述一下希望表达的情绪。');
  const snapshot=JSON.stringify(read().emotionVector);
  return withAIButton($('#emotion-parse'),'解析中…',async()=>{
   const result=await requestAssistant({action:'emotion',kind:'speech',target:'emotion-description',text});
   if($('#tts-model').value!=='index-tts'||$('#emotion-description').value.trim()!==text||JSON.stringify(read().emotionVector)!==snapshot)throw Error('情绪设置已改变，保留当前输入，请重新生成。');
   if(!Array.isArray(result.emotionVector)||result.emotionVector.length!==8||result.emotionVector.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('AI 情绪结果不完整，请重试。');
   $$('[data-emotion-index]').forEach((input,i)=>input.value=result.emotionVector[i]);emotionSummary=result.summary;emotionSource='ai';emotionPending=false;emotionManualOverride=false;emotionStatus();onChange();return true;
  });
 }
 $('#emotion-parse').addEventListener('click',async()=>{try{if(await parseEmotion())toast('情绪组合已填写，可展开查看或继续手动调整。');}catch(error){toast(error.message);}});
 async function prepareEmotion(){
  const text=$('#emotion-description').value.trim();
  if(text&&!emotionManualOverride&&(emotionPending||emotionSource!=='ai')){if(!await parseEmotion())throw Error('请等待当前 AI 任务完成。');}
  else if(!text&&!emotionManualOverride){$$('[data-emotion-index]').forEach(input=>input.value=0);emotionSummary='';emotionSource='manual';emotionPending=false;emotionStatus();onChange();}
 }
 $('#design-text').addEventListener('input',()=>$('#design-count').textContent=$('#design-text').value.length+' / 3000');
 for(const type of ['clone','svc']){
  $('#'+type+'-file').addEventListener('change',e=>upload(type,e.target.files[0]));
  $('#clear-'+type).addEventListener('click',()=>{
   if(type==='clone')clone={id:'',name:''};else svc={id:'',name:''};
   $('#'+type+'-file').value='';captions();source();if(type==='svc')preview('',$('#svc-preview'));onChange();
  });
 }
 function refreshLibrary(){
  const removed=new Set((peekCloudState('uploads')?.items||[]).filter(a=>a.trashed).map(a=>a.id));
  if(removed.has(clone.id)||assetsReady&&clone.id&&!cloudAssets.some(a=>a.id===clone.id)){clone={id:'',name:''};$('#clone-file').value='';captions();}
  library();source();onChange();
 }
 async function loadLibrary(){
  if(libraryLoading)return libraryLoading;
  libraryLoading=(async()=>{try{const [result]=await Promise.all([api('/api/assets'),openCloudState('uploads',{items:[]})]);cloudAssets=result.assets;assetsReady=cloudStateReady('uploads');refreshLibrary();}catch{assetsReady=false;cloudAssets=[];library();source();}finally{libraryLoading=null;}})();return libraryLoading;
 }
 const libraryReady=loadLibrary();
 window.addEventListener('focus',()=>loadLibrary());
 window.addEventListener('sanzo-audio-upload',e=>{if(!cloudAssets.some(a=>a.id===e.detail.id))cloudAssets.push(e.detail);refreshLibrary();});
 window.addEventListener('sanzo-cloud-update',e=>{if(['training','uploads'].includes(e.detail.namespace))refreshLibrary();});
 for(const player of [$('#clone-preview'),$('#svc-preview')])player.addEventListener('error',()=>{if(player.getAttribute('src'))toast('云端音频不可用，请重新选择参考样本。');});
 window.addEventListener('pagehide',()=>$$('#speech-fields audio').forEach(player=>player.pause()));
 async function validate(f){
  await libraryReady;
  const reference=f.voiceSource==='upload'?clone.id:f.libraryVoice;
  if(f.speechModel==='tts'&&(peekCloudState('uploads')?.items||[]).some(a=>a.id===reference&&a.trashed))return'这份音色样本已移入回收站，请选择其他声音，或先恢复素材。';
  if(uploading)return'音色样本正在保存，请稍候。';
  if(f.speechModel==='design'&&!f.designText.trim())return'写下要说的话，再预览设计的音色。';
  if(f.speechModel==='tts'){
   if(f.ttsModel==='index-tts'&&(!Array.isArray(f.emotionVector)||f.emotionVector.length!==8||f.emotionVector.some(v=>!Number.isFinite(v)||v<0||v>1)))return'请将每项情绪填写为 0 到 1 之间的数值。';
   if(!assetsReady&&!(f.libraryVoice||'').startsWith('preset:'))return'暂时无法读取音色素材，请稍后重试。';
   if(!f.speechText.trim())return'写下要说的话，再生成语音预览。';
   const id=f.voiceSource==='upload'?clone.id:f.libraryVoice,sample=sampleList.find(a=>a.id===id);
   if(f.voiceSource==='upload'&&!id)return'请上传一段克隆参考音色。';
   if(f.voiceSource!=='upload'&&!sample)return'请从音色库选择一个声音。';
   if(f.ttsModel==='qwen-tts'&&sample?.demo)return'这是示例占位音色，请选择预设音色或上传自己的样本。';
   if(id&&!sample?.demo&&!sample?.preset){
    try{if(!await checkAudio(id))return'云端未找到参考音色，请重新上传。';}catch{return'无法读取云端音色，请稍后重试。';}
   }
  }
  if(f.speechModel==='rvc'){
   if(f.conversionModel==='svc'){
    if(!svc.id)return'选择 SVC 时，需要上传目标音色的参考样本。';
    try{if(!await checkAudio(svc.id))return'请重新上传 SVC 参考音色。';}catch{return'无法读取 SVC 参考音色，请重新上传。';}
   }else if(!f.rvcVoice)return'请选择已训练的 RVC 音色模型。';
  }
  return'';
 }
 library();return{read,fill,refresh,validate,prepareEmotion};
}
