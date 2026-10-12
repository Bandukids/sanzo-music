import { api } from '/cloud-state.js';
import { storeAudio } from '/training-audio-store.js';
const keys={workspace:'sanzo-workspace-v2',training:'sanzo-training-v1',explore:'sanzo-explore-v1'};
export function legacyData(){const values={};for(const [n,key] of Object.entries(keys))try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value==='object'&&!Array.isArray(value))values[n]=value;}catch{}return values;}
function legacyAudio(id){return new Promise((resolve,reject)=>{const request=indexedDB.open('sanzo-training-audio-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('audio')){db.close();resolve(null);return;}const r=db.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>{db.close();reject(r.error);};};});}
function combine(remote,legacy){
 const result={...legacy,...remote};
 for(const field of ['drafts','albums','workspaces','voiceLibrary','assets','models','tasks'])if(Array.isArray(legacy[field])){const existing=Array.isArray(remote[field])?remote[field]:[];result[field]=[...existing,...legacy[field].filter(item=>item&&typeof item.id==='string'&&!existing.some(a=>a.id===item.id))];}
 for(const field of ['liked','follows'])if(Array.isArray(legacy[field]))result[field]=[...new Set([...(remote[field]||[]),...legacy[field]])];
 if(legacy.comments)result.comments={...legacy.comments,...remote.comments};
 if(result.workspaces?.length>20)throw Error('导入后工作区将超过 20 个，请先整理本地工作区。');return result;
}
export async function importLegacy(report){
 const values=legacyData();let uploaded=0,missing=0;
 const references=new Map();
 for(const a of values.training?.assets||[])if(a.source==='uploaded')references.set(a.id,{name:a.originalName||a.name,kind:a.kind});
 for(const v of values.workspace?.voiceLibrary||[])references.set(v.id,{name:v.name,kind:'voice'});
 for(const f of [values.workspace?.form,...(values.workspace?.drafts||[]).map(d=>d.form)])for(const kind of ['clone','svc'])if(f?.[kind+'Sample'])references.set(f[kind+'Sample'],{name:f[kind+'Name']||'reference.wav',kind:'voice'});
 let index=0;for(const [id,a] of references){report(`正在上传本地音频 ${++index} / ${references.size}…`);const blob=await legacyAudio(id);if(!blob){missing++;continue;}const file=new File([blob],a.name||'reference.wav',{type:blob.type});await storeAudio(id,file,a.kind);uploaded++;}
 for(const [namespace,data] of Object.entries(values)){
  report('正在导入'+({workspace:'作品与专辑',training:'素材与模型资料',explore:'收藏与关注'}[namespace])+'…');
  let done=false;for(let i=0;i<3;i++){const current=await api('/api/state/'+namespace);try{await api('/api/state/'+namespace,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:combine(current.data||{},data),revision:current.revision})});done=true;break;}catch(error){if(error.status!==409)throw error;}}
  if(!done)throw Error('其他页面正在保存，请稍后再次导入。');
 }return {uploaded,missing};
}
