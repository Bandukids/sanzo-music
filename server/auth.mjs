import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),DAY=86400000;
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:{message}},status);
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
async function passwordHash(password){const salt=randomBytes(16).toString('hex');return 'scrypt$'+salt+'$'+Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864})).toString('hex');}
async function passwordMatches(password,encoded){const [,salt,digest]=(encoded||'scrypt$dummy$'+'0'.repeat(128)).split('$');const actual=Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864}));return timingSafeEqual(actual,Buffer.from(digest,'hex'));}
export async function createInvite(DB,email,{role='user',name=email.split('@')[0]}={}){
 if(!validEmail(email)||!['user','admin'].includes(role))throw Error('有效邮箱和角色为必填项。');email=email.toLowerCase();
 let account=await DB.prepare('SELECT user_id FROM auth_accounts WHERE email=?').bind(email).first();
 if(!account){const id=randomUUID(),now=new Date().toISOString();await DB.batch([
  DB.prepare('INSERT INTO users(id,email,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,email,name.slice(0,60),now,now),
  DB.prepare('INSERT INTO auth_accounts(user_id,email,role,created_at) VALUES(?,?,?,?)').bind(id,email,role,now)
 ]);account={user_id:id};}
 const secret=token();await DB.batch([DB.prepare('DELETE FROM auth_invites WHERE user_id=?').bind(account.user_id),DB.prepare('INSERT INTO auth_invites(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash(secret),account.user_id,Date.now()+DAY)]);
 return {userId:account.user_id,token:secret};
}
export async function sessionUser(request,DB){
 const secret=/(?:^|;\s*)sanzo_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];if(!secret)return null;
 return DB.prepare('SELECT a.user_id AS id,a.email,a.role,u.name FROM auth_sessions s JOIN auth_accounts a ON a.user_id=s.user_id JOIN users u ON u.id=a.user_id WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1').bind(hash(secret),Date.now()).first();
}
async function limited(DB,client,max=10){
 const now=Date.now();await DB.prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now).run();
 const result=await DB.prepare('INSERT INTO auth_attempts(client,count,expires_at) VALUES(?,1,?) ON CONFLICT(client) DO UPDATE SET count=count+1 WHERE count<?').bind(client,now+900000,max).run();
 return result.meta.changes>0;
}
const cookie=(secret,secure,age=604800)=>`sanzo_session=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
export async function handleAuth(request,env,user,{client='local'}={}){
 const DB=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/auth/session'&&method==='GET')return user?json({user}):fail('请先登录。',401);
 if(method!=='GET'){
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return fail('请从本站发起操作。',403);
 }
 if(path==='/api/auth/logout'&&method==='POST'){
  const secret=/(?:^|;\s*)sanzo_session=([A-Za-z0-9_-]{43})/.exec(request.headers.get('cookie')||'')?.[1];
  if(secret)await DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(hash(secret)).run();return json({ok:true},200,{'Set-Cookie':cookie('',url.protocol==='https:',0)});
 }
 if(path==='/api/admin/users'&&method==='GET'){
  if(user?.role!=='admin')return fail('需要管理员权限。',403);
  return json({users:(await DB.prepare('SELECT a.user_id AS id,a.email,a.role,a.enabled,a.quota_bytes,u.name,u.bytes AS used FROM auth_accounts a JOIN users u ON u.id=a.user_id ORDER BY a.created_at').all()).results});
 }
 let body;
 if(['POST','PATCH'].includes(method)){
  if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('请使用 JSON 格式。');
  try{const raw=await request.text();if(raw.length>8192)return fail('请求过大。',413);body=JSON.parse(raw);}catch{return fail('请求格式不正确。');}
 }
 if(path==='/api/auth/login'&&method==='POST'){
  if(!await limited(DB,'ip:'+client)||!await limited(DB,'global',100))return fail('尝试次数过多，请 15 分钟后重试。',429);
  if(!validEmail(body.email)||typeof body.password!=='string'||body.password.length>256)return fail('邮箱或密码不正确。',401);
  const account=await DB.prepare('SELECT * FROM auth_accounts WHERE email=?').bind(body.email.toLowerCase()).first();
  const matches=await passwordMatches(body.password,account?.password_hash);
  if(!account?.enabled||!account.password_hash||!matches)return fail('邮箱或密码不正确。',401);
  const secret=token();await DB.batch([DB.prepare('DELETE FROM auth_sessions WHERE expires_at<?').bind(Date.now()),DB.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(hash(secret),account.user_id,Date.now()+7*DAY)]);
  return json({ok:true},200,{'Set-Cookie':cookie(secret,url.protocol==='https:')});
 }
 if(path==='/api/auth/accept'&&method==='POST'){
  if(!await limited(DB,'ip:'+client)||!await limited(DB,'global',100))return fail('尝试次数过多，请稍后重试。',429);
  if(typeof body.token!=='string'||body.token.length!==43||typeof body.password!=='string'||body.password.length<12||body.password.length>256)return fail('密码需为 12–256 个字符，且需使用有效邀请链接。');
  const invite=await DB.prepare('SELECT i.* FROM auth_invites i JOIN auth_accounts a ON a.user_id=i.user_id WHERE i.token_hash=? AND i.expires_at>? AND a.enabled=1').bind(hash(body.token),Date.now()).first();
  if(!invite)return fail('邀请已失效，请联系管理员重新生成。',410);
  const encoded=await passwordHash(body.password);
  DB.raw.exec('BEGIN IMMEDIATE');
  try{const removed=DB.raw.prepare('DELETE FROM auth_invites WHERE token_hash=? AND expires_at>?').run(hash(body.token),Date.now());if(!removed.changes){DB.raw.exec('ROLLBACK');return fail('邀请已失效。',410);}DB.raw.prepare('UPDATE auth_accounts SET password_hash=? WHERE user_id=?').run(encoded,invite.user_id);DB.raw.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(invite.user_id);DB.raw.exec('COMMIT');}
  catch(error){DB.raw.exec('ROLLBACK');throw error;}
  return json({ok:true});
 }
 if(path==='/api/admin/invites'&&method==='POST'){
  if(user?.role!=='admin')return fail('需要管理员权限。',403);if(!validEmail(body.email))return fail('请输入有效邮箱。');
  const invite=await createInvite(DB,body.email);return json({url:url.origin+'/login/#invite='+invite.token,expiresInHours:24},201);
 }
 const match=/^\/api\/admin\/users\/([a-f0-9-]{36})$/.exec(path);
 if(match&&method==='PATCH'){
  if(user?.role!=='admin')return fail('需要管理员权限。',403);
  const account=await DB.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(match[1]).first();if(!account)return fail('账号不存在。',404);
  if(body.enabled!==undefined&&typeof body.enabled!=='boolean'||body.quotaBytes!==undefined&&(!Number.isSafeInteger(body.quotaBytes)||body.quotaBytes<0||body.quotaBytes>1099511627776))return fail('账号状态或容量格式不正确。');
  if(account.role==='admin'&&body.enabled===false)return fail('不能停用管理员账号。');
  await DB.batch([DB.prepare('UPDATE auth_accounts SET enabled=?,quota_bytes=? WHERE user_id=?').bind(body.enabled===undefined?account.enabled:Number(body.enabled),body.quotaBytes??account.quota_bytes,account.user_id),...(body.enabled===false?[DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(account.user_id)]:[])]);return json({ok:true});
 }
 return fail('未找到此接口。',404);
}
