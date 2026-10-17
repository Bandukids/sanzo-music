// Invoked over stdin by generate-community.mjs inside the production container.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(process.env.DATA_DIR!=='/data'||process.env.MEDIA_ROOT!=='/media')throw Error('Community generation must run in the application container.');
const {selfHostedStorage}=await import(pathToFileURL(resolve('server/self-hosted-storage.mjs')));
const {handleGenerations}=await import(pathToFileURL(resolve('server/generations.mjs')));
const {handleReleases}=await import(pathToFileURL(resolve('server/releases.mjs')));
const env={...process.env,...await selfHostedStorage(process.env)};
const user={id:'6bdfa0f1-7b66-4fe3-9d38-0438ead58d26',email:'community@sanzomusic.invalid',name:'SANZO 精选'};
const now=new Date().toISOString();
await env.DB.batch([
 env.DB.prepare('INSERT INTO users(id,email,name,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(user.id,user.email,user.name,now,now),
 env.DB.prepare("INSERT INTO auth_accounts(user_id,email,enabled,created_at) VALUES(?,?,0,?) ON CONFLICT(user_id) DO NOTHING").bind(user.id,user.email,now)
]);
const identity={'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,'oai-authenticated-user-full-name':encodeURIComponent(user.name),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'};
const emit=data=>console.log(JSON.stringify({...data,at:new Date().toISOString()}));
const request=async(handler,path,body)=>{
 const response=await handler(new Request('https://sanzo.internal'+path,{method:'POST',headers:{...identity,'Content-Type':'application/json'},body:JSON.stringify(body||{})}),env),data=await response.json();
 if(!response.ok)throw Error(data.error?.message||'Community generation request failed: '+response.status);return data;
};
const results=[];let index=0;
async function generate(track){
 const requestKey='community-yue2-v1-'+track.id;
 let row=await env.DB.prepare('SELECT id,status,input FROM generations WHERE owner=? AND request_key=?').bind(user.id,requestKey).first();
 let job=row?{id:row.id,status:row.status,input:JSON.parse(row.input)}:(await request(handleGenerations,'/api/generations',{...track.input,requestKey})).job;
 emit({event:'submitted',id:track.id,jobId:job.id,status:job.status});
 const deadline=Date.now()+45*60*1000;
 while(!['succeeded','failed','unknown'].includes(job.status)){
  if(Date.now()>deadline)throw Error('等待超时，保留已有任务；重新运行只同步，不会重复提交。');
  await new Promise(resolve=>setTimeout(resolve,12000));
  job=(await request(handleGenerations,'/api/generations/'+job.id+'/sync')).job;
  emit({event:'progress',id:track.id,jobId:job.id,status:job.status,...(job.error?{error:job.error}:{})});
 }
 if(job.status!=='succeeded')throw Error(track.id+': '+(job.error||job.status)+'；已有任务保留，不会自动重复扣费提交。');
 const published=await request(handleReleases,'/api/releases/'+job.id);
 const asset=await env.DB.prepare('SELECT bytes FROM assets WHERE owner=? AND id=? AND status=\'ready\'').bind(user.id,job.assetId||'music-'+job.id).first();
 const entry={audioURL:published.track.audioURL,releaseId:job.id,duration:job.input.duration,lyrics:job.input.lyrics,instrumental:job.input.instrumental,model:'YUE2',generated:true,bytes:asset?.bytes||0};
 results.push({id:track.id,...entry});emit({event:'completed',id:track.id,entry});
}
let failed=false;
try{
 await Promise.all(Array.from({length:3},async()=>{while(index<catalogue.length){const track=catalogue[index++];try{await generate(track);}catch(error){failed=true;emit({event:'failed',id:track.id,error:error.message});}}}));
 emit({event:'finished',passed:!failed&&results.length===catalogue.length,completed:results.length,total:catalogue.length});
 if(failed)process.exitCode=1;
}finally{await env.runtime.dispose();}
