import { api, exportPending, flushCloudState } from '/cloud-state.js';
const sync=new Map();
export function downloadJSON(data,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function initAccountControls() {
 if(document.querySelector('[data-account-entry]'))return;
 const css=document.createElement('link');css.rel='stylesheet';css.href='/account.css';document.head.append(css);
 const entry=document.createElement('a');entry.href='/account/';entry.className='account-entry';entry.dataset.accountEntry='';entry.setAttribute('aria-label','我的账号');
 if(location.pathname==='/account/')entry.setAttribute('aria-current','page');
 const avatar=document.createElement('span');avatar.className='account-avatar';avatar.textContent='S';
 const copy=document.createElement('span');copy.className='account-copy';const name=document.createElement('strong');name.textContent='我的账号';const state=document.createElement('small');state.textContent='连接云端…';copy.append(name,state);entry.append(avatar,copy);
 const target=document.querySelector('.sidebar-footer')||document.querySelector('.site-header');target?.prepend(entry);
 const warning=document.createElement('aside');warning.className='cloud-warning';warning.hidden=true;warning.setAttribute('role','status');
 const message=document.createElement('span');const retry=document.createElement('button');retry.textContent='重试保存';const backup=document.createElement('button');backup.textContent='导出未保存内容';warning.append(message,retry,backup);document.body.append(warning);
 backup.addEventListener('click',()=>downloadJSON(exportPending(),'sanzo-unsaved.json'));
 retry.addEventListener('click',()=>Promise.allSettled([...sync.keys()].map(flushCloudState)));
 function render(){const failed=[...sync.values()].find(s=>s.status==='error');const pending=[...sync.values()].some(s=>s.status==='pending'||s.status==='saving');state.textContent=failed?'尚未保存':pending?'正在保存…':'已保存到云端';entry.dataset.sync=failed?'error':pending?'saving':'saved';warning.hidden=!failed;message.textContent=failed?.message||'';}
 window.addEventListener('sanzo-sync',event=>{sync.set(event.detail.namespace,event.detail);render();});
 api('/api/account').then(result=>{name.textContent=result.profile.name;avatar.textContent=result.profile.name.slice(0,1).toUpperCase();state.textContent=result.local?'本地开发账号':'我的云端资料';entry.title=result.profile.email;if(sync.size)render();}).catch(error=>{state.textContent=error.status===401?'登录后保存到云端':'云端暂不可用';if(error.status===401){entry.href='/login/';}else{sync.set('account',{status:'error',message:error.message});render();}});
}
