import { mergeState } from '/state-merge.js';
import {requireSignIn,clearAuthSession} from './auth-session.js';
const sessions=new Map();
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('sanzo-cloud'):null;
export async function api(path,options={}) {
 const mutation=!['GET','HEAD'].includes((options.method||'GET').toUpperCase());
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const result=await response.json();
 if(!response.ok){if(response.status===401){clearAuthSession();if(mutation)await requireSignIn();}const error=Error(result.error?.message||'云端服务暂不可用。');error.status=response.status;error.code=result.error?.code;error.current=result.current;throw error;}
 return result;
}
const copy=value=>JSON.parse(JSON.stringify(value));
function status(namespace,value,message=''){window.dispatchEvent(new CustomEvent('sanzo-sync',{detail:{namespace,status:value,message}}));}
export async function openCloudState(namespace,fallback={}) {
 if(sessions.has(namespace)){const existing=sessions.get(namespace);await existing.loading;return copy(existing.data);}
 const s={data:copy(fallback),base:null,revision:0,ready:false,dirty:false,timer:null,running:null,failed:null};sessions.set(namespace,s);
 s.loading=(async()=>{
  try{const loaded=await api('/api/state/'+namespace);s.data=loaded.data??copy(fallback);s.base=copy(loaded.data);s.revision=loaded.revision;s.ready=true;status(namespace,'saved');}
  catch(error){if(error.status===401){s.guest=true;status(namespace,'guest');}else{s.failed=error;status(namespace,'error',error.message);}}
 })();
 await s.loading;
 return copy(s.data);
}
export const peekCloudState=namespace=>sessions.get(namespace)?.data;
export const cloudStateReady=namespace=>sessions.get(namespace)?.ready===true;
export function saveCloudState(namespace,data) {
 const s=sessions.get(namespace);if(!s)return;
 const next=copy(data);if(JSON.stringify(next)===JSON.stringify(s.data))return;
 if(s.guest){s.data=next;return;}
 s.data=next;s.dirty=true;clearTimeout(s.timer);status(namespace,'pending');
 s.timer=setTimeout(()=>flushCloudState(namespace).catch(()=>{}),700);
}
export async function flushCloudState(namespace) {
 const s=sessions.get(namespace);if(!s)return;if(s.running)return s.running;clearTimeout(s.timer);if(!s.dirty)return;
 s.running=(async()=>{
  try{
   await s.loading;
   if(!s.ready){const recovered=await api('/api/state/'+namespace);s.data=mergeState(s.base,s.data,recovered.data||{});s.base=copy(recovered.data);s.revision=recovered.revision;s.ready=true;window.dispatchEvent(new CustomEvent('sanzo-cloud-update',{detail:{namespace,data:copy(s.data)}}));}
   let attempts=0;
   while(s.dirty){
    const sent=copy(s.data);s.dirty=false;status(namespace,'saving');
    try{
     const result=await api('/api/state/'+namespace,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:sent,revision:s.revision})});
     s.base=sent;s.revision=result.revision;channel?.postMessage({namespace});attempts=0;
    }catch(error){
     s.dirty=true;
     if(error.status===409&&attempts++<3){
      const remote=error.current;s.data=mergeState(s.base,s.data,remote.data);s.base=copy(remote.data);s.revision=remote.revision;
      window.dispatchEvent(new CustomEvent('sanzo-cloud-update',{detail:{namespace,data:copy(s.data)}}));continue;
     }throw error;
    }
   }s.failed=null;status(namespace,'saved');
  }catch(error){s.failed=error;status(namespace,'error',error.message);throw error;}
  finally{s.running=null;}
 })();return s.running;
}
export async function refreshCloudState(namespace) {
 const s=sessions.get(namespace);if(!s?.ready||s.dirty||s.running||document.querySelector('dialog[open]')||document.activeElement?.matches('textarea,input:not([type=button]):not([type=checkbox]):not([type=range])'))return;
 if(s.refreshing)return s.refreshing;
 const revision=s.revision;
 s.refreshing=(async()=>{
  try{const latest=await api('/api/state/'+namespace);if(s.dirty||s.running||s.revision!==revision||latest.revision===s.revision)return;s.data=latest.data||{};s.base=copy(latest.data);s.revision=latest.revision;window.dispatchEvent(new CustomEvent('sanzo-cloud-update',{detail:{namespace,data:copy(s.data)}}));}catch(error){status(namespace,'error',error.message);}
  finally{s.refreshing=null;}
 })();return s.refreshing;
}
channel?.addEventListener('message',event=>refreshCloudState(event.data.namespace));
window.addEventListener('focus',()=>sessions.forEach((_,namespace)=>refreshCloudState(namespace)));
window.addEventListener('beforeunload',event=>{if([...sessions.values()].some(s=>s.dirty||s.running)){event.preventDefault();event.returnValue='';}});

// Complete autosave before leaving through a normal internal navigation link.
let navigating=false;
document.addEventListener('click',async event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||(url.pathname===location.pathname&&url.search===location.search))return;
 if(![...sessions.values()].some(s=>s.dirty||s.running))return;
 event.preventDefault();if(navigating)return;navigating=true;
 try{await Promise.all([...sessions.keys()].map(flushCloudState));location.assign(url.href);}
 catch{/* Existing sync error and retry controls retain the unsaved content. */}
 finally{navigating=false;}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sessions.forEach((_,n)=>flushCloudState(n).catch(()=>{}));});
export function exportPending(){const result={};sessions.forEach((s,n)=>{if(s.dirty||s.failed)result[n]=s.data;});return result;}
