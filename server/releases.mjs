import { authenticatedUser, handleLibrary } from './library.mjs';
import { releasedCover } from './covers.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status)=>json({error:{message}},status);
const models={'ace-step':'ACE-Step-V15-XL','minimax-music':'MiniMax-Music-3',yue2:'YUE2'};
function metadata(row){
 const input=JSON.parse(row.input),styles=input.styles||'';
 const style=/lo-?fi|chill/i.test(styles)?'chill':/jazz/i.test(styles)?'jazz':/ambient/i.test(styles)?'ambient':/cinematic|orchestral/i.test(styles)?'cinematic':/electronic|synth|edm/i.test(styles)?'electronic':'pop';
 return {title:input.title,lyrics:input.lyrics,styles,tags:styles.split(/[,，]/).map(t=>t.trim()).filter(Boolean).slice(0,5),style,duration:input.duration||120,instrumental:!!input.instrumental,prompt:input.description||styles,model:models[input.model]||input.model};
}
async function track(row,user){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.owner));
 const author='artist-'+Array.from(new Uint8Array(digest)).slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {...JSON.parse(row.metadata),id:'release-'+row.generation_id,creator:author,artist:row.artist,art:row.cover_asset?'/api/releases/'+row.generation_id+'/cover':row.cover_art||'liquid-glass.png',cover:'glass',caption:JSON.parse(row.metadata).title,plays:0,likes:0,score:0,fresh:Date.parse(row.published_at),published:true,isMine:user?.id===row.owner,publishedAt:row.published_at,audioURL:'/api/releases/'+row.generation_id+'/audio',accent:'#638eb5'};
}
export async function handleReleases(request,env){
 if(!env.DB)return fail('作品发布服务暂不可用。',503);
 const url=new URL(request.url),user=authenticatedUser(request),method=request.method;
 const sql=(q,...args)=>env.DB.prepare(q).bind(...args);
 try{
  if(url.pathname==='/api/releases'&&method==='GET'){
   const rows=(await sql("SELECT r.*,u.name AS artist,c.asset_id AS cover_asset,c.art AS cover_art FROM releases r JOIN users u ON u.id=r.owner LEFT JOIN covers c ON c.owner=r.owner AND c.target_type='song' AND c.target_id=r.generation_id JOIN generations g ON g.id=r.generation_id JOIN assets a ON a.owner=r.owner AND a.id=g.asset_id AND a.status='ready' ORDER BY r.published_at DESC LIMIT 100").all()).results;
   return json({tracks:await Promise.all(rows.map(r=>track(r,user)))});
  }
  const match=/^\/api\/releases\/([a-f0-9-]{36})(\/(?:audio|cover))?$/.exec(url.pathname);
  if(!match)return fail('未找到此接口。',404);
  if(match[2]){
   if(!['GET','HEAD'].includes(method))return fail('不支持此操作。',405);
   const row=await sql('SELECT r.generation_id,r.owner,g.asset_id,u.email FROM releases r JOIN generations g ON g.id=r.generation_id JOIN users u ON u.id=r.owner WHERE r.generation_id=?',match[1]).first();
   if(!row)return fail('歌曲未发布或已取消发布。',404);
   if(match[2]==='/cover')return releasedCover(row,request,env);
   // Only this verified published asset can be read as its owner; other private files remain private.
   const headers=new Headers({'oai-authenticated-user-id':row.owner,'oai-authenticated-user-email':row.email});
   if(request.headers.has('range'))headers.set('range',request.headers.get('range'));
   return handleLibrary(new Request(url.origin+'/api/assets/'+row.asset_id,{method,headers}),env);
  }
  if(!user)return fail('请登录后发布作品。',401);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return fail('请从本站发起操作。',403);
  if(method==='DELETE'){await sql('DELETE FROM releases WHERE generation_id=? AND owner=?',match[1],user.id).run();return json({published:false});}
  if(method!=='POST')return fail('不支持此操作。',405);
  const generation=await sql("SELECT g.* FROM generations g JOIN assets a ON a.owner=g.owner AND a.id=g.asset_id AND a.status='ready' WHERE g.id=? AND g.owner=? AND g.status='succeeded'",match[1],user.id).first();
  if(!generation)return fail('仅可发布自己已生成并保存的歌曲。',404);
  if(JSON.parse(generation.input).type==='speech')return fail('语音作品不能发布到探索音乐。',400);
  await sql('INSERT INTO releases (generation_id,owner,metadata,published_at) VALUES (?,?,?,?) ON CONFLICT(generation_id) DO NOTHING',generation.id,user.id,JSON.stringify(metadata(generation)),new Date().toISOString()).run();
  return json({published:true,track:await track(await sql("SELECT r.*,u.name AS artist,c.asset_id AS cover_asset,c.art AS cover_art FROM releases r JOIN users u ON u.id=r.owner LEFT JOIN covers c ON c.owner=r.owner AND c.target_type='song' AND c.target_id=r.generation_id WHERE r.generation_id=?",generation.id).first(),user)});
 }catch{ return fail('作品发布或读取失败，请稍后重试。',503); }
}
