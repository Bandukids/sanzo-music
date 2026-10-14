import {createTaskPoller,observeTaskPolling} from './task-poller.js';
export function initCoverControls({toast,apply,resolve,describe}){
 const active=new Set();
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;document.body.append(input);let uploadTarget=null;
 const dialog=document.createElement('dialog');dialog.className='creator-dialog cover-prompt-dialog';dialog.setAttribute('aria-labelledby','cover-prompt-title');
 dialog.innerHTML='<div class="creator-dialog-heading"><h2 id="cover-prompt-title">AI 重做封面</h2><button type="button" data-close-cover-prompt aria-label="关闭封面描述窗口"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div><p class="cover-prompt-work"></p><form><label for="cover-prompt-input">封面描述</label><textarea id="cover-prompt-input" maxlength="2000" rows="7" placeholder="比如：雨夜的海岸公路，蓝色霓虹与橙色车灯交错，电影摄影质感…" aria-describedby="cover-prompt-help"></textarea><div class="cover-prompt-caption"><span id="cover-prompt-help">留空则根据音乐基调自动设计。</span><span class="cover-prompt-count">0 / 2000</span></div><p class="cover-prompt-error" role="alert" hidden></p><div class="creator-dialog-actions"><button type="button" class="outline-button" data-close-cover-prompt>取消</button><button type="submit" class="primary-button"><svg aria-hidden="true"><use href="#i-spark"/></svg><span>开始生成</span></button></div></form>';
 document.body.append(dialog);
 const promptInput=dialog.querySelector('textarea'),promptForm=dialog.querySelector('form'),promptError=dialog.querySelector('.cover-prompt-error'),submit=dialog.querySelector('[type=submit]'),submitLabel=submit.querySelector('span');let promptTarget=null,opener=null,submitting=false;
 function updatePromptCount(){dialog.querySelector('.cover-prompt-count').textContent=promptInput.value.length+' / 2000';}
 function openPrompt(button){
  if(submitting||dialog.open)return;
  const selection={id:button.dataset.coverTarget,type:button.dataset.coverType};const content=describe?.(selection.id,selection.type);
  if(!content)return;
  promptTarget=selection;opener=button;
  dialog.querySelector('.cover-prompt-work').textContent=(selection.type==='album'?'专辑 · ':'单曲 · ')+(content.title||'未命名作品');
  promptInput.value='';promptError.hidden=true;updatePromptCount();
  dialog.showModal();promptInput.focus({preventScroll:true});
 }
 promptInput.addEventListener('input',()=>{updatePromptCount();promptError.hidden=true;});
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-close-cover-prompt]'))dialog.close();});
 dialog.addEventListener('close',()=>{promptTarget=null;if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
 promptForm.addEventListener('submit',async e=>{
  e.preventDefault();if(submitting||!promptTarget)return;
  const selection=promptTarget,prompt=promptInput.value.trim();submitting=true;submit.disabled=true;submit.setAttribute('aria-busy','true');submitLabel.textContent='准备中…';promptInput.readOnly=true;promptError.hidden=true;
  try{
   const target=await resolve(selection.id,selection.type);if(!dialog.open||promptTarget!==selection)return;
   if(!target)throw Error('这首作品已不可用，请重新选择。');
   dialog.close();await generate(target,false,prompt);
  }catch(error){promptError.textContent=error.message;promptError.hidden=false;}
  finally{submitting=false;submit.disabled=false;submit.removeAttribute('aria-busy');submitLabel.textContent='开始生成';promptInput.readOnly=false;}
 });
 async function request(path='',options={}){const response=await fetch('/api/covers'+path,{credentials:'same-origin',signal:AbortSignal.timeout(65000),...options});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'封面暂时无法处理。');return result;}
 const tasks=createTaskPoller({fetchJobs:async()=>(await request()).covers,syncJob:async cover=>(await request('/'+cover.id+'/sync',{method:'POST'})).cover,onJobs:apply});
 const polling=observeTaskPolling(tasks,{interval:15000});
 async function generate(target,automatic=false,prompt=''){const key=target.type+':'+target.id;if(active.has(key))return;active.add(key);try{if(!automatic)toast('正在为这段音乐设计封面…');const {cover}=await request('/'+target.type+'/'+encodeURIComponent(target.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:automatic?'auto-'+target.id:crypto.randomUUID(),auto:automatic,...(!automatic?{prompt}:{})})});tasks.accept([cover]);if(cover.status==='fallback')toast(cover.error);else if(!automatic)toast('封面已提交，完成后会自动替换。');polling.wake();}catch(error){toast(error.message);}finally{active.delete(key);}}
 input.addEventListener('change',async()=>{const file=input.files[0],selection=uploadTarget;input.value='';uploadTarget=null;if(!file||!selection)return;if(file.size>8*1024*1024){toast('请选择不超过 8 MB 的图片。');return;}try{const target=await resolve(selection.id,selection.type);if(!target)return;toast('正在上传封面…');const {cover}=await request('/'+target.type+'/'+encodeURIComponent(target.id),{method:'PUT',headers:{'Content-Type':file.type},body:file});tasks.accept([cover]);toast('封面已更新。');}catch(error){toast(error.message);}});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-cover-redo],[data-cover-upload]');if(!button||button.disabled)return;if(button.hasAttribute('data-cover-upload')){uploadTarget={id:button.dataset.coverTarget,type:button.dataset.coverType};input.click();return;}openPrompt(button);});
 polling.start();
 return {generate,destroy:polling.destroy};
}
