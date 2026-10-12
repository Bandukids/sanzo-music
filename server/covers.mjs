import { authenticatedUser,handleLibrary } from './library.mjs';
import { DataStore } from './data-store.mjs';
import { MUSIC_PROVIDERS } from './music-routing.mjs';
import { handleAssistant } from './assistant.mjs';
const APPS={cn:'2077033584728305666',ai:'2107460374575480833'};
const MAX_IMAGE=8*1024*1024;
const pending=new Set(['planning','submitting','queued','running']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message,status=400)=>json({error:{message}},status);
const publicCover=r=>({id:r.id,targetType:r.target_type,targetId:r.target_id,status:r.status,art:r.asset_id?'/api/assets/'+r.asset_id:r.art,error:r.error});
export function fallbackCover(content){
 const styles=String(content.styles||''),story=[content.title,content.description,content.lyrics].join(' ');
 const genres=[
  [/爵士|jazz|saxophone|萨克斯/i,'jazz'],
  [/摇滚|rock|metal|朋克|punk/i,'rock'],
  [/电影|交响|管弦|cinematic|orchestral|soundtrack|epic/i,'cinematic'],
  [/lo[\s-]?fi|chillhop/i,'lofi'],
  [/民谣|吉他|folk|acoustic|indie/i,'folk'],
  [/电子|合成器|electronic|synth|edm|dance|house/i,'electronic'],
  [/钢琴|piano|ambient|氛围/i,'lofi']
 ];
 const genre=genres.find(([pattern])=>pattern.test(styles));
 if(genre)return 'covers/'+genre[1]+'.webp';
 const mood=/海|日落|夏|sunset|ocean|coast/i.test(story)?'folk':/星|宇宙|山|space|mountain/i.test(story)?'cinematic':/夜|雨|安静|night|rain|quiet/i.test(story)?'lofi':'electronic';
 return 'covers/'+mood+'.webp';
}
export function coverPrompt(c,customPrompt=''){const base='Create a sophisticated square album cover, evocative photography or fine art, cinematic light, strong composition, no lettering, no logo, no watermark. ';return base+(customPrompt?'Follow this creative direction: '+customPrompt:'Interpret the emotional mood and imagery of this music. Title: '+c.title+'; Music style: '+(c.styles||'')+'; Story: '+(c.description||'')+'; Lyric imagery: '+(c.lyrics||'').slice(0,1200));}
export function coverNodes(prompt){return [{nodeId:'98',fieldName:'text_b',fieldValue:prompt},{nodeId:'49',fieldName:'aspect_ratio',fieldValue:'1:1 (Square)'}];}
export async function planCoverPrompt(content,customPrompt,env,fetcher=fetch){
 const fallback=coverPrompt(content,customPrompt);
 if(!env.DEEPSEEK_API_KEY)return fallback;
 try{
  const response=await handleAssistant(new Request('https://sanzo.internal/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cover',kind:'songs',target:'cover',text:customPrompt||'',context:{title:String(content.title||'').slice(0,60),description:String(content.description||'').slice(0,500),styles:String(content.styles||'').slice(0,1000),lyrics:String(content.lyrics||'').slice(0,5000)}})}),env,{fetchImpl:fetcher,rateLimit:false});
  const data=await response.json();if(response.ok&&data.result?.text)return data.result.text;
 }catch{}
 return fallback;
}
async function boundedBody(request,max,message='封面文件不能超过 8 MB。'){const reader=request.body?.getReader();if(!reader)throw Error('内容不能为空。');let length=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Error(message);}chunks.push(value);}const bytes=new Uint8Array(length);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return bytes;}
export function imageType(bytes){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';throw Error('请选择 JPG、PNG 或 WebP 图片。');}
async function contentFor(type,id,user,sql){
 if(type==='song'){const g=await sql('SELECT input FROM generations WHERE id=? AND owner=?',id,user.id).first();if(g){const input=JSON.parse(g.input);return {...input,styles:input.styles||input.coverStyles||''};}}
 const doc=await sql("SELECT data FROM documents WHERE owner=? AND namespace='workspace'",user.id).first();const data=doc?JSON.parse(doc.data):{};
 if(type==='song'){const d=data.drafts?.find(d=>(d.id===id||d.jobId===id)&&(!d.type||d.type==='songs'));if(d)return {title:d.title,styles:d.styles,description:d.description,lyrics:d.lyrics};}
 if(type==='album'){const a=data.albums?.find(a=>a.id===id);if(a){const songs=(data.drafts||[]).filter(d=>a.tracks?.includes(d.id));return {title:a.title,description:a.description,styles:songs.map(d=>d.styles||'').join(', ').slice(0,1000),lyrics:songs.map(d=>d.lyrics||'').join('\n').slice(0,1200)};}}
 return null;
}
async function api(fetcher,p,key,path,body){const response=await fetcher(p.origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok&&!data.data?.taskId)throw Object.assign(Error('图片服务暂忙'),{rejected:[400,401,402,403,404,429].includes(response.status)});return data;}
async function saveImage(row,bytes,env,sql){
 const mime=imageType(bytes),store=new DataStore(env.DB),assetId='cover-'+row.id,key='users/'+row.owner+'/'+assetId;
 if(await store.asset(row.owner,assetId))return assetId;
 const stale=await sql("SELECT bytes,object_key FROM assets WHERE owner=? AND id=? AND status='uploading'",row.owner,assetId).first();
 if(stale){await env.BUCKET.delete(stale.object_key);await store.cancelAsset(row.owner,assetId);await store.release(row.owner,stale.bytes);}
 if(!await store.reserve(row.owner,bytes.length))throw Error('存储空间不足，暂时使用备用封面。');
 try{await store.startAsset(row.owner,assetId,key,'cover.'+(mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp'),mime,bytes.length,'cover');await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});await store.finishAsset(row.owner,assetId);return assetId;}
 catch(error){await env.BUCKET.delete(key);await store.cancelAsset(row.owner,assetId);await store.release(row.owner,bytes.length);throw error;}
}
async function discardImage(owner,id,env,sql){const asset=await sql('SELECT * FROM assets WHERE owner=? AND id=?',owner,id).first();if(asset){await env.BUCKET.delete(asset.object_key);await sql('DELETE FROM assets WHERE owner=? AND id=?',owner,id).run();await new DataStore(env.DB).release(owner,asset.bytes);}}
export async function handleCovers(request,env,fetcher=fetch){
 const user=authenticatedUser(request);if(!user)return fail('请登录后管理封面。',401);
 if(!env.DB||!env.BUCKET)return fail('封面存储暂不可用。',503);
 const url=new URL(request.url),method=request.method,sql=(q,...args)=>env.DB.prepare(q).bind(...args);
 if(!['GET','HEAD'].includes(method)&&(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return fail('请从本站发起操作。',403);
 try{
  await new DataStore(env.DB).profile(user);
  if(url.pathname==='/api/covers'&&method==='GET')return json({covers:(await sql('SELECT * FROM covers WHERE owner=?',user.id).all()).results.map(publicCover)});
  const sync=/^\/api\/covers\/([a-f0-9-]{36})\/sync$/.exec(url.pathname);
  if(sync&&method==='POST'){
   let row=await sql('SELECT * FROM covers WHERE id=? AND owner=?',sync[1],user.id).first();if(!row)return fail('未找到此封面。',404);
   if(!pending.has(row.status)||!row.task_id)return json({cover:publicCover(row)});
   const now=Date.now(),lock=await sql('UPDATE covers SET lease_until=?,checked_at=? WHERE id=? AND lease_until<? AND checked_at<?',now+90000,now,row.id,now,now-8000).run();if(!lock.meta.changes)return json({cover:publicCover(row)});
   try{
    const provider=MUSIC_PROVIDERS[row.provider],key=env[provider.secret];let result=await api(fetcher,provider,key,'/openapi/v2/query',{taskId:row.task_id});
    if(!result.status){const old=await api(fetcher,provider,key,'/task/openapi/outputs',{apiKey:key,taskId:row.task_id});if(old.code===0&&old.data?.length)result={status:'SUCCESS',results:old.data.map(r=>({url:r.fileUrl,nodeId:r.nodeId}))};else if([804,805].includes(Number(old.code)))result={status:'RUNNING'};else throw Error('封面结果暂时无法读取。');}
    if(result.status==='SUCCESS'){
     const image=result.results?.find(r=>r.url&&String(r.nodeId)==='95')||result.results?.find(r=>r.url&&/png|jpe?g|webp|image/i.test(r.outputType||r.url));if(!image)throw Error('没有找到封面图片。');
     const address=new URL(image.url);if(address.protocol!=='https:'||address.username||address.password)throw Error('图片地址无效。');
     const response=await fetcher(address.href,{redirect:'manual',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('封面下载暂未完成。');
     const bytes=await boundedBody(response,MAX_IMAGE);const assetId=await saveImage(row,bytes,env,sql);
     const changed=await sql("UPDATE covers SET status='succeeded',asset_id=?,error=NULL,updated_at=? WHERE id=?",assetId,new Date().toISOString(),row.id).run();if(!changed.meta.changes)await discardImage(row.owner,assetId,env,sql);
    }else if(result.status==='FAILED')await sql("UPDATE covers SET status='fallback',error=?,updated_at=? WHERE id=?",'AI 封面未完成，已使用备用图片。',new Date().toISOString(),row.id).run();
    else await sql("UPDATE covers SET status='running',error=NULL WHERE id=?",row.id).run();
   }catch{await sql('UPDATE covers SET error=? WHERE id=?','封面正在同步，暂时显示备用图片。',row.id).run();}
   finally{await sql('UPDATE covers SET lease_until=0 WHERE id=?',row.id).run();}
   row=await sql('SELECT * FROM covers WHERE owner=? AND target_type=? AND target_id=?',user.id,row.target_type,row.target_id).first();return json({cover:publicCover(row)});
  }
  const target=/^\/api\/covers\/(song|album)\/([a-zA-Z0-9_-]{1,120})$/.exec(url.pathname);if(!target||!['POST','PUT'].includes(method))return fail('未找到此接口。',404);
  const type=target[1],id=target[2],content=await contentFor(type,id,user,sql);if(!content)return fail('只能修改自己的单曲或专辑封面。',404);
  const existing=await sql('SELECT * FROM covers WHERE owner=? AND target_type=? AND target_id=?',user.id,type,id).first();
  let requestKey,bytes,automatic=false,customPrompt='';
  if(method==='PUT'){try{bytes=await boundedBody(request,MAX_IMAGE);imageType(bytes);}catch(error){return fail(error.message); }requestKey=crypto.randomUUID();}
  else{let body;try{const raw=await boundedBody(request,16000,'封面请求内容过长，请精简描述。');body=JSON.parse(new TextDecoder().decode(raw));}catch(error){return fail(error.message==='封面请求内容过长，请精简描述。'?error.message:'请求格式不正确。');}if(!body||typeof body!=='object'||Array.isArray(body))return fail('请求格式不正确。');if(typeof body.requestKey!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey))return fail('缺少提交标识。');if(body.prompt!==undefined){if(typeof body.prompt!=='string'||body.prompt.length>2000)return fail('封面描述请控制在 2000 字以内。');customPrompt=body.prompt.trim();}requestKey=body.requestKey;automatic=!!body.auto;
   if(existing&&(existing.request_key===requestKey||body.auto||pending.has(existing.status)))return json({cover:publicCover(existing)});
  }
  const row={owner:user.id,target_type:type,target_id:id,id:crypto.randomUUID(),request_key:requestKey,provider:'auto',status:method==='PUT'?'uploading':'planning',art:existing?.art||fallbackCover(content),asset_id:method==='POST'?existing?.asset_id:null,prompt:coverPrompt(content,customPrompt)};
  if(method==='PUT')row.asset_id=await saveImage(row,bytes,env,sql);
  const inserted=await sql('INSERT INTO covers (owner,target_type,target_id,id,request_key,provider,status,art,asset_id,prompt,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,target_type,target_id) DO UPDATE SET id=excluded.id,request_key=excluded.request_key,provider=excluded.provider,status=excluded.status,art=excluded.art,asset_id=excluded.asset_id,prompt=excluded.prompt,error=NULL,task_id=NULL,lease_until=0,checked_at=0 WHERE ?=1 OR (?=0 AND covers.request_key<>excluded.request_key AND covers.status NOT IN (?,?,?,?))',row.owner,type,id,row.id,requestKey,row.provider,method==='PUT'?'succeeded':row.status,row.art,row.asset_id||null,row.prompt,new Date().toISOString(),method==='PUT'?1:0,automatic?1:0,'planning','submitting','queued','running').run();
  if(method==='POST'&&inserted.meta.changes){
   row.prompt=await planCoverPrompt(content,customPrompt,env,fetcher);
   await sql("UPDATE covers SET prompt=? WHERE id=? AND status='planning'",row.prompt,row.id).run();
   let ambiguous=false;
   for(const [providerId,p]of Object.entries(MUSIC_PROVIDERS)){
    const key=env[p.secret];if(!key)continue;
    const reserve=await sql("UPDATE covers SET provider=?,status='submitting' WHERE id=? AND status='planning' AND ((SELECT COUNT(*) FROM generations WHERE provider=? AND status IN ('submitting','queued','running'))+(SELECT COUNT(*) FROM covers WHERE provider=? AND status IN ('submitting','queued','running')))<?",providerId,row.id,providerId,providerId,p.capacity).run();if(!reserve.meta.changes)continue;
    try{const result=await api(fetcher,p,key,'/task/openapi/ai-app/run',{apiKey:key,webappId:APPS[providerId],nodeInfoList:coverNodes(row.prompt)});if(result.data?.taskId){await sql("UPDATE covers SET task_id=?,status='queued' WHERE id=?",String(result.data.taskId),row.id).run();break;}if(result.code!==undefined&&result.code!==0){await sql("UPDATE covers SET status='planning' WHERE id=?",row.id).run();continue;}ambiguous=true;}
    catch(error){if(error.rejected){await sql("UPDATE covers SET status='planning' WHERE id=?",row.id).run();continue;}ambiguous=true;}
    if(ambiguous)break;
   }
   await sql("UPDATE covers SET status='fallback',error=? WHERE id=? AND status IN ('planning','submitting')",ambiguous?'封面提交状态待核对，已使用备用图片，不会自动重提。':'图片服务繁忙，已选用符合歌曲基调的备用封面。',row.id).run();
  }
  const current=await sql('SELECT * FROM covers WHERE owner=? AND target_type=? AND target_id=?',user.id,type,id).first();
  return json({cover:publicCover(current)},202);
 }catch{return fail('封面暂时无法处理，请稍后重试。',503);}
}
export async function releasedCover(row,request,env){
 const cover=await env.DB.prepare("SELECT asset_id FROM covers WHERE owner=? AND target_type='song' AND target_id=?").bind(row.owner,row.generation_id).first();if(!cover?.asset_id)return fail('暂无生成封面。',404);
 const headers=new Headers({'oai-authenticated-user-id':row.owner,'oai-authenticated-user-email':row.email});return handleLibrary(new Request(new URL('/api/assets/'+cover.asset_id,request.url),{method:request.method,headers}),env);
}
