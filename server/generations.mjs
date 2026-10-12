import {speechCloneInput,speechReference,uploadSpeechReference} from './speech-clone.mjs';
import {seedVCInput,seedVCSamples} from './seedvc.mjs';
import {studioCoverInput,prepareStudioCover,studioCoverNodes} from './studio-cover.mjs';
import {coverInferenceInput,coverInferenceSource,lyricsResult} from './cover-inference.mjs';
import {alignmentItems,organizeLyrics} from './lyrics-structure.mjs';
import {WOOSH_AVAILABLE} from '../dist/service-availability.js';
import { speechDesignInput } from './speech-design.mjs';
import { ACE_LANGUAGES, ACE_KEYSCALES, ACE_TIMESIGNATURES } from './music-options.mjs';
import { authenticatedUser } from './library.mjs';
import { DataStore } from './data-store.mjs';
import { handleAssistant } from './assistant.mjs';
import { MUSIC_PROVIDERS, MUSIC_WORKFLOWS, rankMusicProviders, routingStats } from './music-routing.mjs';
export { MUSIC_PROVIDERS } from './music-routing.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const invalid=message=>Object.assign(new Error(message),{input:true});
const terminal=new Set(['succeeded','failed','unknown']);
const MAX_AUDIO=32*1024*1024;
export function musicInput(body) {
 if(!body||typeof body!=='object')throw invalid('请输入有效创作内容。');
 if(!WOOSH_AVAILABLE&&(body.type==='sounds'||['woosh-flow','woosh-vflow'].includes(body.model)))throw invalid('Woosh 音效生成暂不可用，请稍后再试。');
 if(typeof body.model!=='string'||!Object.hasOwn(MUSIC_WORKFLOWS,body.model))throw invalid('请选择已接入的 ACE-Step-V15-XL、MiniMax-Music-3 或 YUE2。');
 if(body.model==='seedvc-speech')return seedVCInput(body);
 if(body.model==='cover-inference')return coverInferenceInput(body);
 if(body.model==='yue2-cover')return studioCoverInput(body);
 if(['qwen-voice-clone','index-voice-clone'].includes(body.model))return speechCloneInput(body);
 if(body.model==='qwen-voice-design')return speechDesignInput(body);
 const field=(key,max,fallback='')=>{const value=body[key]??fallback;if(typeof value!=='string'||value.length>max)throw invalid('创作内容格式不正确或过长。');return value.trim();};
 const rawTitle=field('title',60),autoTitle=body.autoTitle===true||!rawTitle;
 const title=autoTitle?'新的声音':rawTitle,lyrics=field('lyrics',5000),styles=field('styles',1000);
 if(!styles)throw invalid('请填写音乐风格，或先使用 AI 构思。');
 if(!body.instrumental&&!lyrics)throw invalid('请填写歌词，或先使用 DeepSeek 生成歌词。');
 if(body.backgroundMusic===false)throw invalid('当前工作流暂不支持只生成人声，请开启背景音乐。');
 if(body.songRvcModel||body.songLoraModel||body.exclude)throw invalid('此工作流未开放 RVC、LoRA 和排除风格参数，请先清空这些选项。');
 const gender=body.gender??'auto';if(!['auto','female','male'].includes(gender))throw invalid('人声性别无效。');
 const language=body.language??'zh';if(!ACE_LANGUAGES.has(language))throw invalid('暂不支持此歌词语言。');
 const keyscale=field('keyscale',20),timesignature=field('timesignature',1);
 if(keyscale&&!ACE_KEYSCALES.has(keyscale))throw invalid('调式选项无效。');
 if(timesignature&&!ACE_TIMESIGNATURES.has(timesignature))throw invalid('拍号选项无效。');
 const rawBpm=body.requestedBpm;
 const requestedBpm=rawBpm===undefined||rawBpm===null||rawBpm===''?null:(typeof rawBpm==='number'||typeof rawBpm==='string'&&/^\d{2,3}$/.test(rawBpm)?Number(rawBpm):NaN);
 if(requestedBpm!==null&&(!Number.isInteger(requestedBpm)||requestedBpm<40||requestedBpm>220))throw invalid('BPM 请填写 40 至 220 的整数，或留空由 AI 安排。');
 // Legacy/browser provider, duration and BPM fields are deliberately ignored.
 return {...(body.model==='yue2-abc'?{type:'abc'}:{}),model:body.model,autoTitle,title,lyrics:body.instrumental?'':lyrics,styles,gender,language,keyscale,timesignature,requestedBpm,instrumental:!!body.instrumental,backgroundMusic:true,workspace:field('workspace',120,'default'),description:field('description',5000),mode:body.mode==='custom'?'custom':'simple'};
}
export function nodeInfoList(input) {
 if(input.model==='yue2-cover')return studioCoverNodes(input);
 const workflow=MUSIC_WORKFLOWS[input.model];
 if(['seedvc-speech','cover-inference'].includes(input.model))return Object.entries(workflow.nodes).map(([field,[nodeId,fieldName]])=>({nodeId,fieldName,fieldValue:input[field]}));
 if(['qwen-voice-clone','index-voice-clone'].includes(input.model))return [...Object.entries(workflow.nodes).map(([field,[nodeId,fieldName]])=>({nodeId,fieldName,fieldValue:input[field]})),...(input.model==='index-voice-clone'?[{nodeId:'15',fieldName:'emotion_mode',fieldValue:'vector'},{nodeId:'15',fieldName:'emotion_vector',fieldValue:JSON.stringify(input.emotionVector)}]:[])];
 if(input.model==='qwen-voice-design')return Object.entries(workflow.nodes).map(([field,[nodeId,fieldName]])=>({nodeId,fieldName,fieldValue:field==='speechText'?input.designText:input.styles}));
 const explicit=Number.isInteger(input.requestedBpm),tempo=explicit?input.requestedBpm:input.bpm;
 const prompt=explicit?input.styles.replace(/\b\d+(?:\.\d+)?\s*bpm\b/gi,'').replace(/,\s*,/g,',').replace(/^[,\s]+|[,\s]+$/g,''):input.styles;
 const bpm=workflow.captionBpm&&(explicit||!/\b\d+(?:\.\d+)?\s*bpm\b/i.test(prompt))?`${tempo} BPM`:'';
 // Explicit switches override conflicting vocal tags without changing the user's form.
 const base=input.instrumental||input.gender!=='auto'?prompt.split(',').filter(tag=>!/(?:\b(?:male|female|solo|lead|backing)\s+(?:vocals?|voice|singer)\b|\ba cappella\b|男声|女声|人声|演唱|清唱)/i.test(tag)).join(',').trim():prompt;
 const arrangement=input.model==='ace-step'?[]:[input.keyscale?`key of ${input.keyscale}`:'',input.timesignature?`${{2:'2/4',3:'3/4',4:'4/4',6:'6/8'}[input.timesignature]} time signature`:''];
 const styles=[base,bpm,...arrangement,input.instrumental?'instrumental, no vocals':input.gender==='female'?'female vocals':input.gender==='male'?'male vocals':''].filter(Boolean).join(', ');
 const values={styles,lyrics:input.instrumental?'':input.lyrics,duration:String(input.duration),language:input.language,keyscale:ACE_KEYSCALES.has(input.keyscale)?input.keyscale:'E minor',timesignature:ACE_TIMESIGNATURES.has(input.timesignature)?input.timesignature:'4',bpm:String(tempo)};
 return [...Object.entries(workflow.nodes).map(([field,[nodeId,fieldName]])=>({nodeId,fieldName,fieldValue:values[field]})),...(workflow.fixedNodes||[]).map(node=>({...node}))];
}
function publicJob(row) {
 const input=JSON.parse(row.input);delete input.routingAttempts;delete input.provider;
 if(input.model==='cover-inference'&&row.status==='succeeded'&&input.lyricsArrangement?.status==='running'&&!(row.lease_until>Date.now()))input.lyricsArrangement={...input.lyricsArrangement,status:'failed',message:'上次歌词整理未完成，ASR 原文已保存，可以重试整理。'};
 return {id:row.id,published:!!row.published,taskId:row.task_id,status:row.status,input,assetId:row.asset_id,audioURL:row.asset_id?'/api/assets/'+row.asset_id:null,error:row.error,usage:row.usage?JSON.parse(row.usage):null,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function nameCreation(input,env,fetcher=fetch) {
 if(['seedvc-speech','cover-inference'].includes(input.model))return input;
 if(!input.autoTitle)return input;
 const speech=input.type==='speech';
 const cover=input.model==='yue2-cover';
 const response=await handleAssistant(new Request('https://sanzo.internal/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'name',kind:speech?'speech':'songs',target:speech?'speech':'lyrics',text:speech?(input.speechText||input.designText):input.lyrics.slice(0,5000),context:{styles:input.coverStyles||input.styles,description:cover?'为重新演绎的歌曲起一个独立曲名，综合当前歌词和音乐风格，不沿用文件名，不添加翻唱后缀。':input.description.slice(0,500),instrumental:!!input.instrumental}})}),env,{fetchImpl:fetcher,rateLimit:false});
 const data=await response.json();
 if(cover&&!response.ok)throw Error((data.error?.message||'未能自动起名。')+' 尚未提交翻唱，请稍后重试或填写曲名。');
 // Other creation types retain their existing fallback without resubmitting music.
 return {...input,title:response.ok?data.result.text:input.title};
}
export async function planMusicTiming(input,env,fetcher=fetch) {
 const timingStyles=input.requestedBpm===null||input.requestedBpm===undefined?input.styles:input.styles.replace(/\b\d+(?:\.\d+)?\s*bpm\b/gi,'')+`, ${input.requestedBpm} BPM`;
 const response=await handleAssistant(new Request('https://sanzo.internal/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'timing',kind:'songs',text:input.description.slice(0,500),context:{lyrics:input.instrumental?'':input.lyrics,styles:timingStyles,title:input.title,description:input.description.slice(0,500),instrumental:input.instrumental,backgroundMusic:true,gender:input.gender,language:input.language,shortSong:input.model==='minimax-music'}})}),env,{fetchImpl:fetcher,rateLimit:false});
 const data=await response.json();if(!response.ok)throw new Error((data.error?.message||'AI 未能安排歌曲时长。')+' 尚未提交音乐生成，请稍后重试。');
 return {...data.result,...(input.requestedBpm!==null&&input.requestedBpm!==undefined?{bpm:input.requestedBpm}:{}),...(input.keyscale?{keyscale:input.keyscale}:{})};
}
function cleanMessage(value,env) {
 let message=String(value||'RunningHub 暂时无法处理此任务。').slice(0,600);
 for(const provider of Object.values(MUSIC_PROVIDERS))if(env[provider.secret])message=message.split(env[provider.secret]).join('[redacted]');
 return message.replace(/(?:Bearer\s+)[\w.-]+/gi,'Bearer [redacted]').replace(/\b[a-f0-9]{32}\b/gi,'[redacted]');
}
async function remoteJSON(fetcher,url,body,key) {
 const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 let data;try{data=await response.json();}catch{throw Object.assign(new Error('服务返回了非 JSON 响应。'),{httpStatus:response.status});}
 if(!response.ok&&!data.data?.taskId)throw Object.assign(new Error(data.msg||data.message||data.error?.message||'RunningHub HTTP '+response.status),{httpStatus:response.status,rejected:[400,401,402,403,404,429].includes(response.status)});
 return data;
}
async function audioBytes(fetcher,url,format='mp3') {
 // URLs are accepted only from authenticated RunningHub output, never from client input.
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error('音频结果地址无效。');
 // Workers rejects redirect:'error'. Manual mode preserves the no-follow policy.
 const response=await fetcher(parsed.href,{signal:AbortSignal.timeout(25000),redirect:'manual'});
 if(!response.ok||!response.body)throw new Error('音频保存暂未完成，请稍后重试同步。');
 if(Number(response.headers.get('content-length'))>MAX_AUDIO)throw new Error('音频结果超过 32 MB 保存上限。');
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_AUDIO){await reader.cancel();throw new Error('音频结果超过 32 MB 保存上限。');}chunks.push(value);}
 if(size<3)throw new Error('生成结果为空音频。');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const mp3=bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33||bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0;
 const flac=bytes[0]===0x66&&bytes[1]===0x4c&&bytes[2]===0x61&&bytes[3]===0x43;
 if(format==='flac'?!flac:!mp3)throw new Error('此工作流返回的结果不是可识别的 '+format.toUpperCase()+'。');
 return bytes;
}
export async function abcResult(results,workflow,fetcher=fetch) {
 // SaveText node 22 exports the generated ABC as a Markdown file.
 const outputs=(Array.isArray(results)?results:[]).filter(r=>String(r.nodeId)===workflow.abcNode)
  .sort((a,b)=>Number(String(b.nodeId)===workflow.abcNode)-Number(String(a.nodeId)===workflow.abcNode));
 for(const output of outputs){
  let text=typeof output.text==='string'?output.text:Array.isArray(output.text)?output.text.filter(v=>typeof v==='string').join('\n'):'';
  if(!text&&output.url){
   const url=new URL(output.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('ABC 结果地址无效。');
   const response=await fetcher(url.href,{signal:AbortSignal.timeout(25000),redirect:'manual'});
   if(!response.ok||!response.body)throw new Error('ABC 乐谱保存暂未完成，请稍后重试同步。');
   const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>200000){await reader.cancel();throw new Error('ABC 乐谱超过保存上限。');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  }
  text=text.trim().replace(/^```(?:abc|text)?\s*\n/i,'').replace(/\n```\s*$/,'').trim();
  if(text.length>50000)throw new Error('ABC 乐谱超过 50000 字符保存上限。');
  if(/^X:\s*\d+/m.test(text)&&/^K:\s*\S+/m.test(text))return text;
 }
 throw new Error('任务已完成，尚未获取节点 '+workflow.abcNode+' 的 ABC 乐谱，请稍后重试同步；不会重复生成。');
}
async function syncJob(row,env,fetcher,store,sql) {
 if(terminal.has(row.status)||!row.task_id)return row;
 const now=Date.now();
 const lock=await sql('UPDATE generations SET lease_until=?,checked_at=? WHERE id=? AND owner=? AND lease_until<? AND checked_at<? AND status NOT IN (?,?,?)',now+120000,now,row.id,row.owner,now,now-5000,'succeeded','failed','unknown').run();
 if(!lock.meta.changes)return row;
 const provider=MUSIC_PROVIDERS[row.provider],key=env[provider.secret];
 try{
  if(!key)throw new Error('该生成渠道尚未配置服务端密钥。');
  let result=await remoteJSON(fetcher,provider.origin+'/openapi/v2/query',{taskId:row.task_id},key);
  // The documented application endpoint is legacy; outputs is a compatibility fallback.
  if(!result.status){
   const legacy=await remoteJSON(fetcher,provider.origin+'/task/openapi/outputs',{apiKey:key,taskId:row.task_id},key);
   if(legacy.code===0&&Array.isArray(legacy.data)&&legacy.data.length)result={status:'SUCCESS',results:legacy.data.map(r=>({url:r.fileUrl,outputType:r.fileType,nodeId:r.nodeId,text:r.text}))};
   else if([804,805].includes(Number(legacy.code)))result={status:'RUNNING'};
   else throw new Error(legacy.msg||result.msg||'无法读取任务状态。');
  }
  const usage=result.usage&&typeof result.usage==='object'?Object.fromEntries(['consumeMoney','consumeCoins','taskCostTime','thirdPartyConsumeMoney'].filter(k=>typeof result.usage[k]==='number'&&Number.isFinite(result.usage[k])||typeof result.usage[k]==='string'&&/^\d+(?:\.\d+)?$/.test(result.usage[k])).map(k=>[k,Number(result.usage[k])])):null;
  const status=String(result.status).toUpperCase();
  if(status==='FAILED'){
   await sql('UPDATE generations SET status=?,error=?,usage=?,updated_at=? WHERE id=?','failed',cleanMessage(result.errorMessage||result.errorCode,env),JSON.stringify(usage),new Date().toISOString(),row.id).run();
  }else if(status==='SUCCESS'){
   let input=JSON.parse(row.input);const workflow=MUSIC_WORKFLOWS[input.model],outputNode=workflow?.outputNode;
   if(workflow.abcNode&&!input.abcNotation){
    input.abcNotation=await abcResult(result.results,workflow,fetcher);
    await sql('UPDATE generations SET input=? WHERE id=?',JSON.stringify(input),row.id).run();
   }
   if(workflow.textOnly){
    if(input.inferredLyrics===undefined)input.inferredLyrics=await lyricsResult(result.results,workflow.lyricsNode,fetcher);
    if(!input.lyricsTimestampStatus){
     input.lyricsTimestampStatus='missing';
     if(result.results?.some(r=>String(r.nodeId)===workflow.timestampsNode&&(r.text!==undefined||r.url))){
      try{input.lyricsTimestamps=alignmentItems(await lyricsResult(result.results,workflow.timestampsNode,fetcher,{maxChars:200000,timeout:10000}));input.lyricsTimestampStatus='ready';}
      catch{input.lyricsTimestampStatus='invalid';}
     }
    }
    if(!input.lyricsArrangement||input.lyricsArrangement.status==='running'){
     input.lyricsArrangement={status:'running',timed:!!input.lyricsTimestamps?.length,updatedAt:new Date().toISOString()};
     await sql("UPDATE generations SET status='running',input=?,error=NULL,lease_until=?,updated_at=? WHERE id=?",JSON.stringify(input),Date.now()+120000,new Date().toISOString(),row.id).run();
     input=await organizeLyrics(input,env,fetcher);
    }
    await sql('UPDATE generations SET status=?,input=?,error=NULL,usage=?,updated_at=? WHERE id=?','succeeded',JSON.stringify(input),JSON.stringify(usage),new Date().toISOString(),row.id).run();
   }else{
   const output=result.results?.find(r=>String(r.nodeId)===outputNode&&r.url)||(workflow.outputFormat?null:result.results?.find(r=>r.url&&(/audio|mp3/i.test(r.outputType||'')||/\.mp3(?:\?|$)/i.test(r.url))));
   if(!output)throw new Error('任务完成，但没有找到音频输出。');
   const format=workflow.outputFormat||'mp3',mime=format==='flac'?'audio/flac':'audio/mpeg';
   const id='music-'+row.id,objectKey=`users/${row.owner}/${id}`;
   if(!await store.asset(row.owner,id)){
    // Recover an interrupted upload before reserving bytes again.
    const stale=await sql("SELECT * FROM assets WHERE owner=? AND id=? AND status='uploading'",row.owner,id).first();
    if(stale){await env.BUCKET.delete(stale.object_key);await store.cancelAsset(row.owner,id);await store.release(row.owner,stale.bytes);}
    const bytes=await audioBytes(fetcher,output.url,format);
    if(!await store.reserve(row.owner,bytes.length))throw new Error('云端空间不足，歌曲已生成，请释放空间后重试同步。');
    try{
     await store.startAsset(row.owner,id,objectKey,input.title+'.'+format,mime,bytes.length,input.type==='speech'?'speech':'music');
     await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:mime}});
     await store.finishAsset(row.owner,id);
    }catch(error){await env.BUCKET.delete(objectKey);await store.cancelAsset(row.owner,id);await store.release(row.owner,bytes.length);throw error;}
   }
   await sql('UPDATE generations SET status=?,asset_id=?,error=NULL,usage=?,updated_at=? WHERE id=?','succeeded',id,JSON.stringify(usage),new Date().toISOString(),row.id).run();
   }
  }else if(['QUEUED','RUNNING'].includes(status)){
   await sql('UPDATE generations SET status=?,error=NULL,updated_at=? WHERE id=?',status.toLowerCase(),new Date().toISOString(),row.id).run();
  }else throw new Error('未知任务状态，请稍后重试同步。');
 }catch(error){await sql('UPDATE generations SET error=?,updated_at=? WHERE id=?',cleanMessage(error.message,env),new Date().toISOString(),row.id).run();}
 finally{await sql('UPDATE generations SET lease_until=0 WHERE id=?',row.id).run();}
 return sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND id=?',row.owner,row.id).first();
}
export async function handleGenerations(request,env,fetcher=fetch) {
 const user=authenticatedUser(request);if(!user)return json({error:{message:'请登录后生成音乐。'}},401);
 const url=new URL(request.url),method=request.method;
 if(!['GET','POST'].includes(method))return json({error:{message:'不支持此操作。'}},405);
 if(method==='POST'&&(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:{message:'请从本站发起操作。'}},403);
 if(!env.DB||!env.BUCKET)return json({error:{message:'云端作品存储暂不可用。'}},503);
 const sql=(query,...args)=>env.DB.prepare(query).bind(...args);
 try{
  const store=new DataStore(env.DB);await store.profile(user);
  if(url.pathname==='/api/generations'){
   if(method==='GET')return json({jobs:(await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? ORDER BY created_at DESC LIMIT 100',user.id).all()).results.map(publicJob)});
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw invalid('请使用 JSON 格式。');
   // Bound JSON before parsing, including bodies with no Content-Length.
   const reader=request.body?.getReader();if(!reader)throw invalid('请输入创作内容。');
   let text='',size=0;const decoder=new TextDecoder();
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>210000){await reader.cancel();throw invalid('创作内容过长。');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
   let body;try{body=JSON.parse(text);}catch{throw invalid('请求格式不正确。');}
   if(size>40000&&body?.model!=='yue2-cover')throw invalid('创作内容过长。');
   if(typeof body.requestKey!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey))throw invalid('缺少有效的提交标识。');
   const input=musicInput(body),old=await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND request_key=?',user.id,body.requestKey).first();
   const matches=row=>JSON.stringify(musicInput(JSON.parse(row.input)))===JSON.stringify(input);
   if(old){if(!matches(old))return json({error:{message:'同一提交标识不能更改创作内容。'}},409);return json({job:publicJob(old)});}
   if(!Object.entries(MUSIC_PROVIDERS).some(([id,p])=>MUSIC_WORKFLOWS[input.model].apps[id]&&env[p.secret]))return json({error:{message:'音频生成服务暂未配置。'}},503);
   if(input.type!=='speech'&&!['cover-inference','yue2-cover'].includes(input.model)&&!env.DEEPSEEK_API_KEY)return json({error:{message:'AI 编排服务暂未配置。'}},503);
   const id=crypto.randomUUID(),timestamp=new Date().toISOString();
   const inserted=await sql("INSERT INTO generations (id,owner,request_key,provider,input,status,created_at,updated_at) SELECT ?,?,?,'auto',?,'planning',?,? WHERE (SELECT COUNT(*) FROM generations WHERE owner=? AND status IN ('planning','submitting','queued','running'))<3 ON CONFLICT(owner,request_key) DO NOTHING",id,user.id,body.requestKey,JSON.stringify(input),timestamp,timestamp,user.id).run();
   if(!inserted.meta.changes){const existing=await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND request_key=?',user.id,body.requestKey).first();if(!existing)return json({error:{message:'最多同时生成 3 个音频作品，请等待现有任务完成。'}},429);if(!matches(existing))return json({error:{message:'同一提交标识不能更改创作内容。'}},409);return json({job:publicJob(existing)});}
   try{
    const timing=input.type==='speech'||['cover-inference','yue2-cover'].includes(input.model)?null:await planMusicTiming(input,env,fetcher),limits=MUSIC_WORKFLOWS[input.model].duration;
    const sample=['qwen-voice-clone','index-voice-clone'].includes(input.model)?await speechReference(input,user.id,env,store):null;
    const conversion=input.model==='seedvc-speech'?await seedVCSamples(input,user.id,env,store):null;
    const inference=input.model==='cover-inference'?await coverInferenceSource(input,user.id,env,store):null;
    const cover=input.model==='yue2-cover'?await prepareStudioCover(input,user.id,env,store,fetcher):null;
    const named=await nameCreation(cover||input,env,fetcher);if(sample)named.referenceName=sample.referenceName;
    if(conversion){named.sourceName=conversion.source.referenceName;named.referenceName=conversion.reference.referenceName;if(named.autoTitle)named.title=(named.sourceName.replace(/\.[^.]+$/,'')+' · '+named.referenceName).slice(0,60);}
    if(inference){named.sourceName=inference.referenceName;named.title=(inference.referenceName.replace(/\.[^.]+$/,'')+' · 原曲解析').slice(0,60);}
    const planned=timing?{...named,...timing,duration:Math.max(limits.min,Math.min(limits.max,timing.duration)),routingAttempts:[]}:{...named,routingAttempts:[]};
    const excluded=[];let accepted=false,lastError=null;
    while(excluded.length<Object.keys(MUSIC_PROVIDERS).length){
     const routes=rankMusicProviders(input.model,env,await routingStats(sql),excluded);
     if(!routes.length)break;
     const route=routes[0];excluded.push(route.id);
     const attempt={provider:route.id,outcome:'submitting',at:new Date().toISOString()};planned.routingAttempts.push(attempt);
     const reserved=await sql("UPDATE generations SET provider=?,input=?,status='submitting',updated_at=? WHERE id=? AND status='planning' AND ((SELECT COUNT(*) FROM generations WHERE provider=? AND status IN ('submitting','queued','running'))+(SELECT COUNT(*) FROM covers WHERE provider=? AND status IN ('submitting','queued','running')))<?",route.id,JSON.stringify(planned),new Date().toISOString(),id,route.id,route.id,route.capacity).run();
     if(!reserved.meta.changes){planned.routingAttempts.pop();continue;}
     try{
      const key=env[route.secret];
      const execution=inference?{...planned,sourceAudio:await uploadSpeechReference(inference,route,key,fetcher)}:conversion?{...planned,sourceAudio:await uploadSpeechReference(conversion.source,route,key,fetcher),referenceAudio:await uploadSpeechReference(conversion.reference,route,key,fetcher)}:sample?{...planned,referenceAudio:await uploadSpeechReference(sample,route,key,fetcher)}:planned;
      const result=await remoteJSON(fetcher,route.origin+'/task/openapi/ai-app/run',{apiKey:key,webappId:route.appId,nodeInfoList:nodeInfoList(execution)},key);
      if(!result.data?.taskId)throw Object.assign(new Error(result.msg||'任务未被音乐服务接受。'),{rejected:result.code!==0&&result.code!==undefined});
      attempt.outcome='accepted';
      await sql('UPDATE generations SET task_id=?,status=?,input=?,error=NULL,updated_at=? WHERE id=?',String(result.data.taskId),String(result.data.taskStatus).toUpperCase()==='RUNNING'?'running':'queued',JSON.stringify(planned),new Date().toISOString(),id).run();
      accepted=true;break;
     }catch(error){
      if(!error.rejected){attempt.outcome='unknown';await sql('UPDATE generations SET input=? WHERE id=?',JSON.stringify(planned),id).run();throw error;}
      attempt.outcome='rejected';lastError=error;
      await sql("UPDATE generations SET status='planning',input=?,updated_at=? WHERE id=?",JSON.stringify(planned),new Date().toISOString(),id).run();
     }
    }
    if(!accepted)throw Object.assign(lastError||new Error('生成服务暂忙，请稍后重试。'),{rejected:true});
   }catch(error){
    // An ambiguous network timeout must NEVER trigger another paid submission.
    const current=await sql('SELECT provider FROM generations WHERE id=?',id).first(),safe=error.rejected||current.provider==='auto';
    await sql('UPDATE generations SET status=?,error=?,updated_at=? WHERE id=?',safe?'failed':'unknown',safe?cleanMessage(error.message,env):'提交状态暂未确认，请在 RunningHub 任务记录核对；本站不会自动重复提交。',new Date().toISOString(),id).run();
   }
   return json({job:publicJob(await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND id=?',user.id,id).first())},202);
  }
  const match=/^\/api\/generations\/([a-f0-9-]{36})(\/sync|\/lyrics)?$/.exec(url.pathname);
  if(!match)return json({error:{message:'未找到此接口。'}},404);
  let row=await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND id=?',user.id,match[1]).first();
  if(!row)return json({error:{message:'未找到此生成任务。'}},404);
  if(match[2]==='/lyrics'){
   if(method!=='POST')return json({error:{message:'请使用 POST 整理歌词。'}},405);
   let input=JSON.parse(row.input);
   if(input.model!=='cover-inference'||row.status!=='succeeded'||typeof input.inferredLyrics!=='string')throw invalid('请先完成原曲解析。');
   if(!env.DEEPSEEK_API_KEY)return json({error:{message:'歌词整理服务暂未配置。'}},503);
   const now=Date.now(),lock=await sql('UPDATE generations SET lease_until=? WHERE id=? AND owner=? AND lease_until<?',now+120000,row.id,user.id,now).run();
   if(!lock.meta.changes)return json({error:{message:'歌词正在整理，请稍候。'}},409);
   try{
    input=JSON.parse((await sql('SELECT input FROM generations WHERE id=? AND owner=?',row.id,user.id).first()).input);
    // A recent successful result is reusable across duplicate clicks/tabs.
    if(input.lyricsArrangement?.status!=='succeeded'||now-Date.parse(input.lyricsArrangement.updatedAt)>30000){
     const previous=input;
     input={...input,lyricsArrangement:{status:'running',timed:!!input.lyricsTimestamps?.length,updatedAt:new Date().toISOString()}};
     await sql('UPDATE generations SET input=? WHERE id=?',JSON.stringify(input),row.id).run();
     input=await organizeLyrics(input,env,fetcher);
     if(input.lyricsArrangement.status==='failed'&&previous.structuredLyrics!==undefined)input.structuredLyrics=previous.structuredLyrics;
     await sql('UPDATE generations SET input=?,updated_at=? WHERE id=?',JSON.stringify(input),new Date().toISOString(),row.id).run();
    }
   }finally{await sql('UPDATE generations SET lease_until=0 WHERE id=?',row.id).run();}
   row=await sql('SELECT *, EXISTS(SELECT 1 FROM releases WHERE releases.generation_id=generations.id) AS published FROM generations WHERE owner=? AND id=?',user.id,row.id).first();
  }else if(match[2]){if(method!=='POST')return json({error:{message:'请使用 POST 同步任务。'}},405);row=await syncJob(row,env,fetcher,store,sql);}
  else if(method!=='GET')return json({error:{message:'不支持此操作。'}},405);
  return json({job:publicJob(row)});
 }catch(error){return json({error:{message:error.input?error.message:'生成服务暂不可用，请稍后再查询任务。'}},error.input?400:503);}
}
