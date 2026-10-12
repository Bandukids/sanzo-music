import { openCloudState, saveCloudState, flushCloudState, peekCloudState, cloudStateReady } from '/cloud-state.js';
const $=s=>document.querySelector(s),PAGE_SIZE=20;
let people=await openCloudState('people',{users:[]}),page=1,editingId=null,busy=false,toastTimer;
let loadFailed=!cloudStateReady('people');
const users=()=>people.users||[];
const shortId=id=>'USR-'+id.slice(0,8).toUpperCase();
function toast(message){$('#people-toast').textContent=message;$('#people-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#people-toast').hidden=true;},4000);}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function render(){
 const all=users(),query=$('#people-search').value.trim().toLocaleLowerCase(),status=$('#people-filter').value;
 const filtered=all.filter(u=>(status==='all'||u.status===status)&&(!query||[u.name,u.email,u.notes,shortId(u.id),u.id].some(v=>(v||'').toLocaleLowerCase().includes(query))));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
 $('#people-total').textContent=all.length;$('#people-active').textContent=all.filter(u=>u.status==='active').length;$('#people-inactive').textContent=all.filter(u=>u.status==='inactive').length;
 const list=$('#people-list');list.replaceChildren();
 for(const u of filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
  const row=node('tr');const identity=node('td');identity.dataset.label='用户';const person=node('div',undefined,'person-identity');const avatar=node('span',u.name.slice(0,1),'person-avatar');avatar.setAttribute('aria-hidden','true');const copy=node('div');copy.append(node('strong',u.name),node('small',shortId(u.id)));person.append(avatar,copy);identity.append(person);
  const email=node('td',u.email||'未填写','');email.dataset.label='联系邮箱';if(!u.email)email.className='person-empty';
  const notes=node('td');notes.dataset.label='备注';const note=node('span',u.notes||'—','person-note');note.title=u.notes;notes.append(note);
  const state=node('td');state.dataset.label='状态';const badge=node('span',u.status==='active'?'启用':'停用','person-status');badge.dataset.status=u.status;state.append(badge);
  const actions=node('td');actions.dataset.label='操作';const group=node('div',undefined,'person-actions');const edit=node('button','编辑');edit.type='button';edit.setAttribute('aria-label','编辑 '+u.name);edit.disabled=busy;edit.addEventListener('click',()=>openEditor(u.id));const toggle=node('button',u.status==='active'?'停用':'启用');toggle.type='button';toggle.disabled=busy;toggle.setAttribute('aria-label',(u.status==='active'?'停用 ':'启用 ')+u.name);toggle.addEventListener('click',()=>toggleStatus(u.id));group.append(edit,toggle);actions.append(group);row.append(identity,email,notes,state,actions);list.append(row);
 }
 $('#people-empty').hidden=filtered.length>0;$('#empty-add').hidden=all.length>0||loadFailed;$('#people-empty-title').textContent=loadFailed?'用户资料暂不可用':all.length?'没有匹配的用户':'还没有用户资料';$('#people-empty-copy').textContent=loadFailed?'请使用上方的“重试保存”重新连接。':all.length?'试试其他关键词，或切换状态筛选。':'添加第一位用户，记录昵称、联系方式和备注。';
 $('#people-count').textContent=loadFailed?'等待重新连接':filtered.length?`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,filtered.length)} / ${filtered.length} 位用户`:'0 位用户';$('#people-page').textContent=`${page} / ${pages}`;$('#people-prev').disabled=page===1;$('#people-next').disabled=page===pages;$('#add-user').disabled=busy||loadFailed||all.length>=1000;$('#empty-add').disabled=busy;
}
function openEditor(id=null){
 if(busy)return;if(!id&&users().length>=1000){toast('当前最多可保存 1000 位用户。');return;}
 const u=users().find(u=>u.id===id);editingId=id;$('#people-form').reset();$('#people-dialog-title').textContent=u?'编辑用户':'新增用户';$('#people-record-id').textContent=u?shortId(u.id)+' · 创建于 '+new Date(u.createdAt).toLocaleDateString('zh-CN'):'保存后自动分配用户编号';$('#person-name').value=u?.name||'';$('#person-email').value=u?.email||'';$('#person-notes').value=u?.notes||'';$('#person-status').value=u?.status||'active';$('#people-form-feedback').textContent='';$('#people-dialog').showModal();$('#person-name').focus();
}
function setBusy(value){busy=value;$('#people-save').disabled=value;$('#people-save').textContent=value?'正在保存…':'保存用户';$('#people-close').disabled=value;$('#people-cancel').disabled=value;for(const input of $('#people-form').querySelectorAll('input,textarea,select'))input.disabled=value;render();}
async function persist(){saveCloudState('people',people);await flushCloudState('people');people=peekCloudState('people');}
async function toggleStatus(id){
 const u=users().find(u=>u.id===id);if(!u||busy)return;setBusy(true);
 people={...people,users:users().map(v=>v.id===id?{...v,status:v.status==='active'?'inactive':'active',updatedAt:new Date().toISOString()}:v)};
 try{await persist();toast(u.status==='active'?'已停用用户记录。':'已启用用户记录。');}catch(error){toast(error.message);}finally{setBusy(false);}
}
$('#add-user').addEventListener('click',()=>openEditor());$('#empty-add').addEventListener('click',()=>openEditor());$('#people-close').addEventListener('click',()=>$('#people-dialog').close());$('#people-cancel').addEventListener('click',()=>$('#people-dialog').close());$('#people-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('#people-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const name=$('#person-name').value.trim(),email=$('#person-email').value.trim().toLowerCase(),notes=$('#person-notes').value.trim(),status=$('#person-status').value;
 if(!name){$('#people-form-feedback').textContent='请填写用户昵称。';$('#person-name').focus();return;}
 const current=users().find(u=>u.id===editingId);if(editingId&&!current){$('#people-form-feedback').textContent='这条用户资料已发生变化，请重新打开。';return;}
 const now=new Date().toISOString(),record={id:editingId||crypto.randomUUID(),name,email,notes,status,createdAt:current?.createdAt||now,updatedAt:now};
 editingId=record.id;people={...people,users:current?users().map(u=>u.id===record.id?record:u):[record,...users()]};setBusy(true);$('#people-form-feedback').textContent='';
 try{await persist();$('#people-dialog').close();toast('用户资料已保存。');}catch(error){$('#people-form-feedback').textContent=error.message+' 内容已保留，可重试保存。';}finally{setBusy(false);}
});
for(const id of ['#people-search','#people-filter'])$(id).addEventListener(id==='#people-search'?'input':'change',()=>{page=1;render();});$('#people-prev').addEventListener('click',()=>{page--;render();});$('#people-next').addEventListener('click',()=>{page++;render();});
window.addEventListener('sanzo-cloud-update',event=>{if(event.detail.namespace==='people'){people=event.detail.data||{users:[]};loadFailed=!cloudStateReady('people');render();}});
window.addEventListener('sanzo-sync',event=>{if(event.detail.namespace!=='people')return;const s=event.detail;$('#people-sync').textContent=s.status==='error'?'尚未保存，请重试':s.status==='saved'?'已保存到云端':'正在保存…';$('#people-sync').dataset.error=String(s.status==='error');});
$('#people-sync').textContent=loadFailed?'加载失败，请重试':'已加载用户资料';$('#people-sync').dataset.error=String(loadFailed);render();
