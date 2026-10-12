import { DataStore, STORAGE_LIMIT, FILE_LIMIT } from './data-store.mjs';
import {readABCText,ABC_FILE_LIMIT} from '../dist/abc-material.js';
const namespaces = new Set(['workspace','training','explore','people','uploads']);
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers});
const failure = (message,status=400,code='INPUT') => json({error:{message,code}},status);
const inputError=(message,status=400)=>Object.assign(Error(message),{inputStatus:status});
export function authenticatedUser(request) {
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 if(!id||!email||id.length>200||email.length>320)return null;
 let name=email.split('@')[0];
 if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')try{name=decodeURIComponent(request.headers.get('oai-authenticated-user-full-name')||'')||name;}catch{}
 return {id,email,name:name.slice(0,60)};
}
async function readJSON(request) {
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw inputError('请使用 JSON 格式。');
 const reader=request.body?.getReader();let bytes=0,chunks=[];
 if(!reader)throw inputError('内容不能为空。');
 while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1500000){await reader.cancel();throw inputError('内容过大，请减少作品数量后重试。',413);}chunks.push(value);}
 const body=new Uint8Array(bytes);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(body));}catch{throw inputError('内容格式不正确。');}
}
function validData(namespace,data) {
 if(!data||typeof data!=='object'||Array.isArray(data))return false;
 const records=(field,limit)=>data[field]===undefined||Array.isArray(data[field])&&data[field].length<=limit&&data[field].every(v=>v&&typeof v==='object'&&typeof v.id==='string'&&v.id.length<=120);
 const strings=field=>data[field]===undefined||Array.isArray(data[field])&&data[field].length<=10000&&data[field].every(v=>typeof v==='string'&&v.length<=120);
 if(namespace==='people')return Array.isArray(data.users)&&records('users',1000)&&new Set(data.users.map(u=>u.id)).size===data.users.length&&data.users.every(u=>
  /^[a-zA-Z0-9_-]{1,120}$/.test(u.id)&&typeof u.name==='string'&&u.name.trim().length>0&&u.name.length<=60&&
  typeof u.email==='string'&&u.email.length<=254&&(!u.email||/^[^\s@]+@[^\s@]+$/.test(u.email))&&
  typeof u.notes==='string'&&u.notes.length<=500&&['active','inactive'].includes(u.status)&&
  typeof u.createdAt==='string'&&u.createdAt.length<=30&&Number.isFinite(Date.parse(u.createdAt))&&
  typeof u.updatedAt==='string'&&u.updatedAt.length<=30&&Number.isFinite(Date.parse(u.updatedAt)));
 if(namespace==='workspace')return records('workspaces',22)&&(data.workspaces===undefined||data.workspaces.filter(w=>!['speech','abc'].includes(w.id)).length<=20)&&records('drafts',1000)&&records('albums',1000)&&records('voiceLibrary',1000)&&strings('liked')&&(data.form===undefined||data.form&&typeof data.form==='object'&&!Array.isArray(data.form));
 if(namespace==='uploads')return records('items',10000)&&Array.isArray(data.items)&&data.items.every(i=>(i.name===undefined||typeof i.name==='string'&&i.name.length<=120)&&(i.trashed===undefined||typeof i.trashed==='boolean'));
 if(namespace==='training')return records('assets',1000)&&records('models',1000)&&records('tasks',1000);
 return strings('follows')&&(!data.comments||typeof data.comments==='object'&&!Array.isArray(data.comments));
}
export async function handleLibrary(request,env) {
 const user=authenticatedUser(request);if(!user)return failure('请先登录，再使用云端作品与素材。',401,'SIGN_IN');
 const url=new URL(request.url),method=request.method;
 if(!['GET','HEAD'].includes(method)){
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return failure('请从本站发起操作。',403,'ORIGIN');
 }
 if(!env.DB)return failure('云端存储暂不可用，请稍后重试。',503,'STORAGE');
 try {
  const store=new DataStore(env.DB),profile=await store.profile(user);
  if(url.pathname==='/api/account'){
   if(method==='GET')return json({profile:{id:profile.id,email:profile.email,name:profile.name,createdAt:profile.created_at},storage:{used:profile.bytes,limit:STORAGE_LIMIT},local:env.LOCAL_PREVIEW===true});
   if(method==='PUT'){const body=await readJSON(request);if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60)return failure('昵称需为 1–60 个字符。');await store.rename(user.id,body.name.trim());return json({name:body.name.trim()});}
   return failure('不支持此操作。',405);
  }
  const state=/^\/api\/state\/([a-z]+)$/.exec(url.pathname);
  if(state&&namespaces.has(state[1])){
   if(method==='GET')return json(await store.document(user.id,state[1]));
   if(method==='PUT'){
    const body=await readJSON(request);
    if(!Number.isSafeInteger(body.revision)||body.revision<0||!validData(state[1],body.data))return failure('保存内容格式不正确。');
    if(!await store.save(user.id,state[1],body.data,body.revision))return json({error:{code:'CONFLICT',message:'另一页面更新了内容，请合并后重试。'},current:await store.document(user.id,state[1])},409);
    return json({revision:body.revision+1});
   }return failure('不支持此操作。',405);
  }
  if(url.pathname==='/api/assets'&&method==='GET')return json({assets:await store.assets(user.id)});
  const asset=/^\/api\/assets\/([a-zA-Z0-9_-]{1,120})$/.exec(url.pathname);
  if(asset){
   if(!env.BUCKET)return failure('音频存储暂不可用。',503,'STORAGE');
   const id=asset[1],found=await store.asset(user.id,id);
   if(method==='DELETE'){
    if(!found)return failure('未找到这份素材。',404,'NOT_FOUND');
    if(!['upload-music','upload-speech','upload-abc','voice'].includes(found.kind))return failure('此文件不属于上传素材。',409);
    const metadata=await store.document(user.id,'uploads');
    if(!metadata.data?.items?.some(i=>i.id===id&&i.trashed))return failure('请先将素材移入回收站。',409);
    await env.BUCKET.delete(found.object_key);
    await env.DB.batch([
     store.statement("UPDATE users SET bytes=MAX(0,bytes-COALESCE((SELECT bytes FROM assets WHERE owner=? AND id=? AND status='ready'),0)) WHERE id=?",user.id,id,user.id),
     store.statement("DELETE FROM assets WHERE owner=? AND id=? AND status='ready'",user.id,id)
    ]);
    return json({id,deleted:true});
   }
   if(method==='GET'||method==='HEAD'){
    if(!found)return failure('未找到这段音频。',404,'NOT_FOUND');
    const range=method==='GET'?request.headers.get('range'):null;
    let requestedRange=null;
    if(range&&!/^bytes=\d*-\d*$/.test(range))return failure('无效的音频范围。',416);
    if(range){
     const [start,end]=range.slice(6).split('-');
     if(!start&&!end||start&&(!Number.isSafeInteger(Number(start))||Number(start)>=found.bytes)||end&&!Number.isSafeInteger(Number(end))||start&&end&&Number(end)<Number(start)||!start&&Number(end)===0)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+found.bytes,'Cache-Control':'no-store'}});
     const offset=start?Number(start):Math.max(0,found.bytes-Number(end));
     const last=start&&end?Math.min(Number(end),found.bytes-1):found.bytes-1;
     requestedRange={offset,length:last-offset+1};
    }
    // Plain range objects work in both Workers and the local Miniflare RPC bridge.
    const object=method==='HEAD'?await env.BUCKET.head(found.object_key):await env.BUCKET.get(found.object_key,requestedRange?{range:requestedRange}:undefined);
    if(!object)return failure('音频暂时无法读取。',404,'NOT_FOUND');
    const h=new Headers({'Content-Type':found.mime,'Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(found.name)}`});
    const partial=requestedRange?object.range||requestedRange:null;
    h.set('Content-Length',String(partial?.length??object.size));h.set('ETag',object.httpEtag);
    if(partial)h.set('Content-Range',`bytes ${partial.offset}-${partial.offset+partial.length-1}/${object.size}`);
    return new Response(method==='HEAD'?null:object.body,{status:partial?206:200,headers:h});
   }
   if(method==='PUT'){
    const bytes=Number(request.headers.get('content-length'));
    const requestedKind=request.headers.get('x-asset-kind'),isABC=requestedKind==='upload-abc';
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>(isABC?ABC_FILE_LIMIT:FILE_LIMIT))return failure(isABC?'请选择不超过 200 KB 的 ABC 乐谱。':'请选择不超过 100 MB 的音频。',413);
    let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'');}catch{return failure('文件名格式不正确。');}
    const ext=name.split('.').at(-1)?.toLowerCase();
    const types=isABC?{abc:'text/plain; charset=utf-8',txt:'text/plain; charset=utf-8',md:'text/plain; charset=utf-8'}:{wav:'audio/wav',mp3:'audio/mpeg',flac:'audio/flac',m4a:'audio/mp4',ogg:'audio/ogg',aac:'audio/aac'};
    if(!types[ext]||name.length>200||!request.body)return failure(isABC?'请选择 ABC、TXT 或 MD 乐谱文件。':'请选择 WAV、MP3、FLAC、M4A、OGG 或 AAC 音频。');
    if(found)return json({id,bytes:found.bytes},200);
    let abcPayload;
    if(isABC){
     const reader=request.body.getReader(),chunks=[];let length=0;
     while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>ABC_FILE_LIMIT){await reader.cancel();return failure('ABC 文件不能超过 200 KB。',413);}chunks.push(value);}
     if(length!==bytes)return failure('文件大小不匹配，请重新上传。');
     abcPayload=new Uint8Array(length);let offset=0;for(const chunk of chunks){abcPayload.set(chunk,offset);offset+=chunk.byteLength;}
     try{readABCText(abcPayload);}catch(error){return failure(error.message);}
    }
    const kind=['style','upload-music','upload-speech','upload-abc'].includes(requestedKind)?requestedKind:'voice';
    if(!await store.reserve(user.id,bytes))return failure('存储空间不足，请联系管理员扩容。',413,'QUOTA');
    const key=(isABC?'abc/':'audio/')+crypto.randomUUID();let started=false;
    try {
     await store.startAsset(user.id,id,key,name,types[ext],bytes,kind);started=true;
     const payload=isABC?abcPayload:env.LOCAL_PREVIEW===true?await request.arrayBuffer():request.body;
     const written=await env.BUCKET.put(key,payload,{httpMetadata:{contentType:types[ext]}});
     if(written.size!==bytes)throw Error('Audio size did not match');
     await store.finishAsset(user.id,id);return json({id,bytes},201);
    }catch(error){await env.BUCKET.delete(key);if(started)await store.cancelAsset(user.id,id);await store.release(user.id,bytes);throw error;}
   }return failure('不支持此操作。',405);
  }
  return failure('未找到此接口。',404,'NOT_FOUND');
 }catch(error){if(error.inputStatus)return failure(error.message,error.inputStatus);console.error('Library request failed',error?.message);return failure('保存或读取失败，请保留当前内容并重试。',503,'STORAGE');}
}
