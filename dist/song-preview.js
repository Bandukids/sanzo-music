import {artworkURL} from '/artwork.js';
import {patchMarkup} from '/stable-dom.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const copyIcon='<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
const copyButton=(field,label,text)=>`<button type="button" class="song-preview-copy" data-preview-copy="${field}" aria-label="复制${label}" title="复制${label}" ${text.trim()?'':'disabled'}>${copyIcon}</button>`;
const pending=status=>['planning','submitting','queued','running'].includes(status);

export async function downloadCover(draft,toast){
 try{
  const response=await fetch(artworkURL(draft.art),{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('封面暂时无法下载，请稍后重试。');
  const blob=await response.blob(),mime=blob.type.split(';')[0];
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
  if(!extension||!blob.size)throw Error('没有读取到可下载的封面图片。');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=(draft.title||'歌曲').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')+'-封面.'+extension;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){toast(error.message);}
}

export function initSongPreview({findDraft,workspaceName,isPlaying,onPlay,toast}){
 const panel=document.querySelector('#song-preview'),content=panel.querySelector('.song-preview-scroll'),layout=document.querySelector('.workspace-layout');
 let selected=null,signature='',returnFocus=null;
 function highlight(){
  document.querySelectorAll('.draft-card').forEach(card=>{
   const draft=findDraft(card.dataset.creationId),song=draft&&(!draft.type||draft.type==='songs')&&!draft.trashed;
   card.classList.toggle('is-previewed',card.dataset.creationId===selected);
   if(song){card.tabIndex=0;card.setAttribute('aria-label','查看歌曲 '+draft.title+' 的预览');}
  });
 }
 function close(restoreFocus=true){
  panel.hidden=true;layout.classList.remove('has-song-preview');selected=null;signature='';highlight();
  if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
 }
 function syncPlayback(){
  const button=panel.querySelector('[data-preview-play]');if(!button||!selected)return;
  const active=isPlaying(selected),name=active?'pause':'play';
  if(button.querySelector('use')?.getAttribute('href')!=='#i-'+name)button.innerHTML=icon(name);
  button.setAttribute('aria-label',active?'暂停预览歌曲':'播放预览歌曲');
  panel.classList.toggle('is-playing',active);
 }
 function refresh(){
  highlight();if(!selected)return;
  const d=findDraft(selected);if(!d||d.trashed){close(false);return;}
  const lyrics=d.lyrics||d.form?.lyrics||'',styles=d.styles||d.form?.styles||'';
  const model={'ace-step':'ACE-Step-V15-XL','minimax-music':'MiniMax-Music-3',yue2:'YUE2'}[d.form?.model]||'Songs';
  const status=d.published?'已发布':d.assetId?'已生成':d.kind==='demo'?'演示音轨':pending(d.jobStatus)?'创作中':'草稿';
  const next=JSON.stringify([d.title,d.art,d.description,lyrics,styles,model,status,d.coverStatus,workspaceName(d.workspace)]);
  if(next!==signature){
   signature=next;const playable=!!d.assetId||d.kind==='demo';
   patchMarkup(content,`<figure class="song-preview-art"><img src="${esc(artworkURL(d.art))}" alt="${esc(d.title)} 封面"><span class="song-preview-status">${esc(status)}</span><button type="button" class="song-preview-play" data-preview-play ${playable?'':'disabled'} aria-label="播放预览歌曲" title="${playable?'播放 / 暂停':'尚未生成音频'}">${icon('play')}</button></figure><div class="song-preview-heading"><span class="song-preview-kicker">${esc(workspaceName(d.workspace))} <span>·</span> ${esc(model)}</span><h2 id="song-preview-title">${esc(d.title)}</h2></div><div class="song-preview-cover-tools" role="group" aria-label="封面管理"><button type="button" data-cover-redo data-cover-type="song" data-cover-target="${esc(d.id)}" ${pending(d.coverStatus)?'disabled':''}>${icon('spark')}${pending(d.coverStatus)?'封面绘制中':'AI 重做封面'}</button><button type="button" data-cover-upload data-cover-type="song" data-cover-target="${esc(d.id)}">${icon('upload')}上传封面</button><button type="button" class="song-preview-download" data-preview-download><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>下载封面</button></div><section class="song-preview-style"><div class="song-preview-section-heading"><h3>音乐风格</h3><div class="song-preview-section-actions"><span>MUSIC STYLE</span>${copyButton('styles','音乐风格',styles)}</div></div><p>${esc(styles||'还未填写音乐风格。')}</p></section>${d.description&&d.description!==lyrics?`<details class="song-preview-story"><summary>歌曲介绍</summary><p>${esc(d.description)}</p></details>`:''}<section class="song-preview-lyrics"><div class="song-preview-section-heading"><h3>歌词</h3><div class="song-preview-section-actions"><span>LYRICS</span>${copyButton('lyrics','歌词',lyrics)}</div></div>${lyrics?lyrics.split(/\n\s*\n/).map(block=>`<p>${esc(block)}</p>`).join(''):`<p class="song-preview-empty">${d.form?.instrumental?'纯音乐作品，让旋律讲述故事。':'这首作品还没有歌词。'}</p>`}</section>`);
  }
  syncPlayback();
 }
 function open(id,focus=false){
  const d=findDraft(id);if(!d||d.trashed||d.type&&d.type!=='songs')return;
  const changed=selected!==id;selected=id;returnFocus=document.querySelector(`.draft-card[data-creation-id="${CSS.escape(id)}"]`);
  panel.hidden=false;layout.classList.add('has-song-preview');refresh();if(changed)content.scrollTop=0;
  if(focus)panel.querySelector('[data-preview-close]').focus({preventScroll:true});
 }
 panel.querySelector('[data-preview-close]').addEventListener('click',()=>close());
 panel.addEventListener('click',async event=>{
  const copy=event.target.closest('[data-preview-copy]');
  if(copy){
   const d=findDraft(selected),field=copy.dataset.previewCopy,text=d?.[field]||d?.form?.[field]||'',label=field==='lyrics'?'歌词':'音乐风格';
   if(!text.trim())return;
   try{await navigator.clipboard.writeText(text);toast(label+'已复制到剪贴板。');}
   catch{toast('无法访问剪贴板，请选中文本手动复制。');}
   return;
  }
  if(event.target.closest('[data-preview-play]'))onPlay(selected);
  if(event.target.closest('[data-preview-download]')){const d=findDraft(selected);if(d)downloadCover(d,toast);}
 });
 document.addEventListener('click',event=>{
  const entry=event.target.closest('[data-song-preview]');if(entry){open(entry.dataset.songPreview);entry.closest('details')?.removeAttribute('open');return;}
  const card=event.target.closest('.draft-card[data-creation-id]');if(!card)return;
  const action=event.target.closest('button,a,input,select,textarea,summary,details,label');
  if(action&&!action.hasAttribute('data-play'))return;
  const selection=window.getSelection();if(selection?.toString()&&card.contains(selection.anchorNode)&&card.contains(selection.focusNode))return;
  open(card.dataset.creationId);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!panel.hidden&&!document.querySelector('dialog[open]')){event.preventDefault();close();}
  if(['Enter',' '].includes(event.key)&&event.target.matches('.draft-card')){event.preventDefault();open(event.target.dataset.creationId,true);}
 });
 return {open,close:()=>close(false),refresh,syncPlayback};
}
