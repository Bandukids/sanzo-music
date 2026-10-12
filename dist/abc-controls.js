import {WOOSH_AVAILABLE} from './service-availability.js';
import { parseScore, numberedSVG, synthesizePCM, encodeWAV, escapeXML as esc } from './abc-core.js';
import { loadABCLibrary } from './abc-library.js';
import { requestAssistant } from './ai-assistant.js';

export const abcOutputLabel = draft => ({ abc:'ABC 乐谱', numbered:'简谱', staff:'五线谱', audio:'ABC 合成音乐', ai:'AI 编曲设想' }[draft.abcOutput] || 'ABC 乐谱');
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const filename = title => String(title || 'SANZO乐谱').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80);
const download = (blob,name) => { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); };
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function initABCControls({ readForm, onChange, onRefresh, onSave, findDraft, listDrafts, onEdit, toast, beforePlay, onGenerate }) {
  let pending=false, preview=null, audioURL=null, previewRequest=0;
  const modal=document.createElement('dialog');modal.id='abc-preview-dialog';modal.className='abc-preview-dialog';modal.setAttribute('aria-labelledby','abc-preview-title');
  modal.innerHTML=`<header class="abc-preview-header"><div><span class="micro-label">SANZO / SCORE ROOM</span><h2 id="abc-preview-title"></h2></div><button type="button" class="abc-close" aria-label="关闭乐谱预览">${icon('close')}</button></header><div class="abc-preview-meta" id="abc-preview-meta"></div><div class="abc-preview-switch" role="group" aria-label="预览谱式"><button type="button" data-preview-format="numbered">简谱</button><button type="button" data-preview-format="staff">五线谱</button><button type="button" data-preview-format="abc">ABC 文本</button></div><div class="abc-paper" id="abc-paper"></div><div class="abc-audio-panel"><button type="button" id="abc-audition">${icon('play')}试听基础旋律</button><div id="abc-audio-result" hidden><span id="abc-audio-label">简单合成</span><audio id="abc-audio" controls preload="metadata" aria-label="ABC 合成音频播放器"></audio></div></div><footer class="abc-preview-footer"><span id="abc-preview-status"></span><div><button type="button" id="abc-continue-edit">继续编辑</button><button type="button" data-score-download="md">下载 MD</button><button type="button" data-score-download="abc">下载 ABC</button><button type="button" data-score-download="svg">下载乐谱 SVG</button><button type="button" data-score-download="mp3" hidden>下载音乐 MP3</button><button type="button" data-score-download="wav" hidden>下载音频 WAV</button></div></footer>`;
  const saveLayoutButton=document.createElement('button');saveLayoutButton.type='button';saveLayoutButton.id='abc-save-layout';saveLayoutButton.textContent='保存当前谱式';saveLayoutButton.hidden=true;modal.querySelector('.abc-preview-footer>div').prepend(saveLayoutButton);
  document.body.append(modal);
  const fail = error => { $('#abc-error').hidden=false;$('#abc-error').textContent=error.message;toast(error.message); };
  const clearError = () => { $('#abc-error').hidden=true; };
  const availableScores=()=>listDrafts().filter(d=>d.type==='abc'&&d.workspace==='abc'&&!d.trashed&&d.form?.abcNotation?.trim());
  function refreshPicker() {
    const select=$('#abc-workspace-score'),value=select.value,scores=availableScores();
    const markup='<option value="">选择 ABC 工作区中的作品</option>'+scores.map(d=>`<option value="${esc(d.id)}">${esc(d.title)} · ${esc(abcOutputLabel(d))}</option>`).join('');
    if(select.innerHTML!==markup){select.innerHTML=markup;select.value=scores.some(d=>d.id===value)?value:'';}
    $('#abc-workspace-help').textContent=scores.length?'选择后将使用这份作品的 ABC 乐谱。':'ABC 工作区还没有可用乐谱，请先生成乐谱或上传 ABC。';
    if(value&&!scores.some(d=>d.id===value)&&$('#abc-source').value==='workspace'){
      $('#abc-notation').value='';$('#abc-file-name').value='';onChange();
    }
    const workspace=$('#abc-source').value==='workspace';
    $('#abc-workspace-source').hidden=!workspace;$('#abc-upload-card').hidden=workspace;
    $$('[data-abc-source]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.abcSource==='workspace')===workspace)));
  }
  function refresh() {
    const flow=$('#abc-flow').value==='music'?'music':'score',ai=$('#abc-synthesis').value==='ai';
    $$('[data-abc-flow]').forEach(b=>{const active=b.dataset.abcFlow===flow;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    $('#abc-flow-panel').setAttribute('aria-labelledby','abc-flow-'+flow);
    $('#abc-score-fields').hidden=flow==='music'&&!ai;$('#abc-music-fields').hidden=flow!=='music';
    $('#abc-synthesis-help').textContent=ai?'以 ABC 为旋律基础，填写歌词与音乐风格，构思完整作品。':'跟随乐谱的旋律与速度，合成器乐。选取或上传后即可试听、下载。';
    refreshPicker();refreshSource();onRefresh();
    if(document.body.dataset.creationType==='abc') {
      loadABCLibrary().then(refreshSource).catch(error=>toast(error.message));
      $('#music-model-row').hidden=true;
      $('#composer-title').innerHTML=(flow==='score'?'写下新的旋律':'让乐谱成曲')+'<span>。</span>';
      $('#composer-eyebrow').textContent=flow==='score'?'TEXT INTO SCORE':'ABC INTO MUSIC';
      $('#work-title-label').textContent=flow==='score'?'乐谱名称':'作品名称';
      $('#generate span').textContent=flow==='score'?'生成 ABC 与音乐':ai?'创建 AI 编曲设想':'合成音乐';
      $('.composer-footer>p').textContent=flow==='score'?'YUE2 真实生成 · 同时保存 ABC 与音乐':ai?'AI 合成后续接入 · 保存编曲设想':'本地基础合成 · 可试听并下载 WAV';
    }
  }
  function refreshSource() {
    const text=$('#abc-notation').value.trim();let score=null;
    if(text&&globalThis.ABCJS)try{score=parseScore(text);}catch{}
    const ready=!!score;
    $('#abc-upload-card').dataset.ready=String(ready);
    $('#abc-upload-name').textContent=ready?($('#abc-file-name').value||score.title||'已载入 ABC 乐谱'):'上传 ABC 乐谱';
    $('#abc-upload-meta').textContent=ready?[score.key.root+(score.key.acc||''),score.meter.num+'/'+score.meter.den,'♩ '+score.bpm,Math.ceil(score.duration)+' 秒'].join(' · '):'.abc / .txt · 最多 50000 字符';
    $('#abc-upload-action').innerHTML=(ready?'更换乐谱':'选择文件')+' <span aria-hidden="true">↗</span>';
    $('#abc-preview-source').hidden=!ready;
  }
  function fill(form) {
    $('#abc-source').value=form.abcSource==='workspace'?'workspace':'upload';refreshPicker();$('#abc-workspace-score').value=form.abcSourceId||'';if(form.abcSource==='workspace'&&form.abcSourceId&&!$('#abc-workspace-score').value){$('#abc-notation').value='';$('#abc-file-name').value='';}
    $('#abc-flow').value=form.abcFlow==='music'?'music':'score';$('#abc-synthesis').value=form.abcSynthesis==='ai'?'ai':'simple';
    $('#abc-instrument').value=['keys','pluck','sine'].includes(form.abcInstrument)?form.abcInstrument:'keys';
    $('#abc-tempo').value=form.abcTempo || '';
    $('#abc-file-name').value=form.abcFileName||'';
    $('#abc-score-format').value=form.abcScoreFormat==='staff'?'staff':'numbered';refresh();clearError();
  }
  function setBusy(value) {
    pending=value;$('#generate').disabled=value||document.body.dataset.creationType==='sounds'&&!WOOSH_AVAILABLE;
    $$('#abc-fields button, #abc-fields select, #abc-fields input, #abc-fields textarea').forEach(b=>b.disabled=value);
  }
  async function generate(form=readForm()) {
    if(pending)return;clearError();setBusy(true);
    try {
      await loadABCLibrary();
      if(form.abcFlow!=='music') {
        await onGenerate(form);
      } else {
        if(form.abcSource==='workspace'){
          const source=availableScores().find(d=>d.id===form.abcSourceId);
          if(!source)throw Error('这份乐谱已移出 ABC 工作区或删除，请重新选择。');
          form={...form,abcNotation:source.form.abcNotation,abcFileName:source.title,abcLyrics:source.lyrics||source.form.abcLyrics||'',abcPrompt:source.styles||source.form.abcPrompt||''};
        }
        if(!form.abcNotation.trim())throw Error('请上传 ABC 乐谱，或从 ABC 工作区选择一份乐谱。');
        const score=parseScore(form.abcNotation,{tempo:form.abcSynthesis==='ai'?'':form.abcTempo});
        if(form.abcSynthesis==='ai') {
          if(!form.abcLyrics.trim()&&!form.abcPrompt.trim())throw Error('填写歌词或音乐风格，再创建 AI 编曲设想。');
          const draft=onSave(form,{abcOutput:'ai',prototype:true});await showDraft(draft);toast('AI 编曲设想已保存，音频生成后续接入。');
        } else {
          if(!form.title.trim()){
            $('#generate span').textContent='正在命名…';
            const sourceText=form.abcNotation,sourceId=form.abcSourceId;
            let title;
            try{const named=await requestAssistant({action:'name',kind:'abc',target:'abc',text:sourceText.slice(0,1000),context:{description:`乐谱：${score.title}；来源：${form.abcFileName||'上传乐谱'}；调号 ${score.key.root}${score.key.acc||''}${score.key.mode||''}，拍号 ${score.meter.num}/${score.meter.den}，速度 ${score.bpm} BPM`.slice(0,500),styles:form.abcPrompt.slice(0,1000),lyrics:form.abcLyrics.slice(0,5000),instrumental:true}});title=named.text;}
            catch{title=(score.title!=='未命名旋律'?score.title:form.abcFileName?.replace(/\.(abc|txt|md)$/i,'')||`${score.key.root}${score.key.acc||''}调旋律 · ${score.bpm} BPM`).slice(0,30);toast('AI 命名暂不可用，已根据乐谱自动命名。');}
            const current=readForm();
            if(current.type!=='abc'||current.abcFlow!=='music'||current.abcNotation!==sourceText||current.abcSourceId!==sourceId)throw Error('乐谱来源已改变，请重新合成。');
            form={...form,title:current.title.trim()||title,workspace:current.workspace};
            $('#song-title').value=form.title;onChange();
          }
          if(form.abcSource==='workspace'&&!availableScores().some(d=>d.id===form.abcSourceId))throw Error('这份乐谱已移出 ABC 工作区，请重新选择。');
          setBusy(true);$('#generate span').textContent='正在合成…';await nextPaint();
          const wav=new Blob([encodeWAV(synthesizePCM(score,{instrument:form.abcInstrument}))],{type:'audio/wav'});
          const result={...form,abcLyrics:'',abcPrompt:'',abcInstrumental:true,abcBackgroundMusic:true,abcGender:'auto'};
          const draft=onSave(result,{abcOutput:'audio',duration:score.duration+.65});await showDraft(draft,wav);toast('合成音乐已保存，可试听或下载 WAV。');
        }
      }
    }catch(error){fail(error);}finally{setBusy(false);refresh();}
  }
  function saveLayout() {
    if(!preview||!['numbered','staff'].includes(preview.format))return;
    try { const form={...preview.draft.form,abcScoreFormat:preview.format};const draft=onSave(form,{abcOutput:preview.format});showDraft(draft);toast((form.abcScoreFormat==='staff'?'五线谱':'简谱')+'已保存到 ABC 工作区。'); }
    catch(error){fail(error);}
  }
  function clearAudio() { $('#abc-audio').pause();$('#abc-audio').removeAttribute('src');$('#abc-audio').load();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=null; }
  function useAudio(wav,autoplay=false) {
    clearAudio();$('#abc-audio-label').textContent='基础旋律 · 本地合成';audioURL=URL.createObjectURL(wav);$('#abc-audio').src=audioURL;$('#abc-audio-result').hidden=false;$('#abc-audition').hidden=true;modal.querySelector('[data-score-download="wav"]').hidden=false;
    preview.wav=wav;
    if(autoplay){beforePlay();$('#abc-audio').play().catch(()=>toast('音频已就绪，请点击播放。'));}
  }
  function renderPreview(format) {
    if(!preview)return;
    preview.format=format;const paper=$('#abc-paper');paper.replaceChildren();paper.className='abc-paper';paper.removeAttribute('style');
    $$('[data-preview-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewFormat===format)));
    if(format==='abc') { const pre=document.createElement('pre');pre.textContent=preview.draft.form.abcNotation;paper.append(pre); }
    else if(format==='numbered')paper.innerHTML=numberedSVG(preview.score);
    else {
      globalThis.ABCJS.renderAbc(paper,preview.score.text,{staffwidth:740,paddingtop:30,paddingbottom:30,paddingleft:30,paddingright:30,oneSvgPerLine:false,add_classes:true});
      const svg=paper.querySelector('svg');if(svg)svg.setAttribute('viewBox',`0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
    }
    modal.querySelector('[data-score-download="svg"]').hidden=format==='abc';saveLayoutButton.hidden=format==='abc';
  }
  async function showDraft(draft,wav=null) {
    if(!draft || draft.trashed)return;
    const request=++previewRequest;
    try {
      await loadABCLibrary();
      if(request!==previewRequest)return;
      const form=draft.form || {},score=parseScore(form.abcNotation,{tempo:draft.abcOutput==='audio'?form.abcTempo:''});
      clearAudio();preview={draft,score,wav:null,format:'numbered'};
      score.title=draft.title||score.title;$('#abc-preview-title').textContent=draft.title;
      $('#abc-preview-meta').innerHTML=`<span>${esc(abcOutputLabel(draft))}</span><span>${esc(score.key.root+(score.key.acc||'')+(score.key.mode||''))} · ${score.meter.num}/${score.meter.den}</span><span>♩ ${score.bpm}</span><span>${score.events.length} 个音符 · ${Math.ceil(score.duration)} 秒</span>`;
      $('#abc-preview-status').textContent=draft.unsavedSource?'已载入乐谱 · 可保存简谱或五线谱':draft.abcOutput==='ai'?'AI 编曲设想 · 待接入模型':draft.prototype?'固定示例 · 已保留歌词与曲风':'已保存到 ABC 工作区';
      $('#abc-continue-edit').hidden=!draft.id;
      $('#abc-audio-result').hidden=true;$('#abc-audition').hidden=false;modal.querySelector('[data-score-download="mp3"]').hidden=!draft.assetId;modal.querySelector('[data-score-download="wav"]').hidden=true;
      $('#abc-audio-label').textContent=({keys:'柔和键盘',pluck:'清亮拨弦',sine:'纯净正弦'}[form.abcInstrument]||'柔和键盘')+' · 基础合成';
      renderPreview(draft.abcOutput==='staff'?'staff':draft.abcOutput==='abc'?'abc':'numbered');
      if(!modal.open)modal.showModal();
      modal.scrollTop=0;
      if(draft.assetId){$('#abc-audio').src='/api/assets/'+draft.assetId;$('#abc-audio-result').hidden=false;$('#abc-audio-label').textContent='YUE2 · 生成音乐';}
      if(wav)useAudio(wav);
      else if(draft.abcOutput==='audio')audition();
    }catch(error){fail(error);}
  }
  async function audition() {
    if(!preview)return;const target=preview;$('#abc-audition').disabled=true;$('#abc-audition').textContent='正在合成…';
    try { await nextPaint();const score=parseScore(target.draft.form.abcNotation,{tempo:target.draft.abcOutput==='audio'?target.draft.form.abcTempo:''});const wav=new Blob([encodeWAV(synthesizePCM(score,{instrument:target.draft.form.abcInstrument}))],{type:'audio/wav'});if(preview!==target||!modal.open)return;useAudio(wav,true); }
    catch(error){toast(error.message);}finally{$('#abc-audition').disabled=false;$('#abc-audition').innerHTML=icon('play')+'试听基础旋律';}
  }
  async function exportPreview(format) {
    if(!preview)return;const target=preview;const name=filename(target.draft.title);
    if(format==='md')download(new Blob([target.draft.form.abcNotation],{type:'text/markdown;charset=utf-8'}),name+'.md');
    else if(format==='abc')download(new Blob([target.score.text],{type:'text/plain;charset=utf-8'}),name+'.abc');
    else if(format==='mp3') {
      try{const response=await fetch('/api/assets/'+target.draft.assetId,{credentials:'same-origin'});if(!response.ok)throw Error('音乐暂时无法下载。');download(await response.blob(),name+'.mp3');}catch(error){toast(error.message);}
    }else if(format==='svg') {
      const svg=$('#abc-paper svg');if(!svg)return;
      const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('style','background:white;color:#233d54;fill:#233d54;stroke:none;stroke-width:0');
      const background=document.createElementNS('http://www.w3.org/2000/svg','rect');background.setAttribute('width','100%');background.setAttribute('height','100%');background.setAttribute('fill','white');copy.prepend(background);
      download(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}),name+(target.format==='staff'?'_五线谱':'_简谱')+'.svg');
    }else if(format==='wav') {
      if(!target.wav)await audition();if(!target.wav)return;download(target.wav,name+'.wav');
    }
  }
  $$('[data-abc-flow]').forEach(b=>b.addEventListener('click',()=>{$('#abc-flow').value=b.dataset.abcFlow;refresh();onChange();}));
  $$('[data-abc-source]').forEach(b=>b.addEventListener('click',()=>{
    if($('#abc-source').value!==b.dataset.abcSource){$('#abc-source').value=b.dataset.abcSource;$('#abc-notation').value='';$('#abc-file-name').value='';$('#abc-workspace-score').value='';}
    clearError();refreshPicker();refreshSource();onChange();
  }));
  $('#abc-workspace-score').addEventListener('focus',refreshPicker);
  $('#abc-workspace-score').addEventListener('change',()=>{
    const draft=availableScores().find(d=>d.id===$('#abc-workspace-score').value);
    $('#abc-notation').value=draft?.form.abcNotation||'';$('#abc-file-name').value=draft?.title||'';
    $('#abc-lyrics').value=draft?.lyrics||draft?.form.abcLyrics||'';$('#abc-prompt').value=draft?.styles||draft?.form.abcPrompt||'';
    $('#abc-instrument').value='keys';$('#abc-tempo').value='';clearError();refreshSource();onChange();
    loadABCLibrary().then(refreshSource).catch(error=>fail(error));
  });
  window.addEventListener('sanzo-cloud-update',event=>{if(event.detail.namespace==='workspace'){refreshPicker();refreshSource();}});
  $('#abc-synthesis').addEventListener('change',refresh);
  saveLayoutButton.addEventListener('click',saveLayout);
  $('#abc-preview-source').addEventListener('click',()=>{const form=readForm();showDraft({type:'abc',abcOutput:'abc',title:form.abcFileName||form.abcNotation.match(/^T:\s*(.+)$/m)?.[1]||'ABC 乐谱',form,unsavedSource:true});});
  $('#abc-import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>200000)throw Error('请选择 50000 字符以内的 ABC 文本。');const text=await file.text();await loadABCLibrary();parseScore(text);$('#abc-notation').value=text;$('#abc-file-name').value=file.name;$('#abc-instrument').value='keys';$('#abc-tempo').value='';clearError();refreshSource();onChange();toast('ABC 乐谱已上传。');}catch(error){fail(error);}event.target.value='';});
  $('#abc-notation').addEventListener('input',clearError);
  modal.querySelector('.abc-close').addEventListener('click',()=>modal.close());modal.addEventListener('close',()=>{previewRequest++;clearAudio();preview=null;});
  $('#abc-continue-edit').addEventListener('click',()=>{const id=preview?.draft.id;modal.close();if(id)onEdit(id);});
  modal.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.previewFormat)renderPreview(b.dataset.previewFormat);if(b.dataset.scoreDownload)exportPreview(b.dataset.scoreDownload);});
  $('#abc-audition').addEventListener('click',audition);$('#abc-audio').addEventListener('play',beforePlay);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-abc-preview],[data-abc-download]');if(!b)return;const id=b.dataset.abcPreview || b.dataset.abcDownload,draft=findDraft(id);if(!draft||draft.trashed)return;if(b.dataset.abcDownload){if(!draft.form?.abcNotation?.trim()){toast('这份草稿还没有 ABC 乐谱，请先生成或填写。');return;}download(new Blob([draft.form.abcNotation],{type:'text/plain;charset=utf-8'}),filename(draft.title)+'.abc');}else showDraft(draft);});
  window.addEventListener('pagehide',clearAudio,{once:true});
  async function synthesize(draft) {
    await loadABCLibrary();
    const score=parseScore(draft.form.abcNotation,{tempo:draft.form.abcTempo});
    return {wav:new Blob([encodeWAV(synthesizePCM(score,{instrument:draft.form.abcInstrument}))],{type:'audio/wav'}),duration:score.duration+.65};
  }
  return { fill, refresh, generate, showDraft, synthesize };
}
