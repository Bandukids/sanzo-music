import {resolve} from 'node:path';
import {mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {loadConfig} from '../server/config.mjs';
import {initializeMedia} from '../server/file-bucket.mjs';
import {SQLiteDB,migrate} from '../server/sqlite.mjs';
import {createInvite,validEmail} from '../server/auth.mjs';
const config=loadConfig();
const get=name=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:undefined;};
const email=get('email');if(!validEmail(email))throw Error('Usage: node scripts/setup-self-hosted.mjs --email admin@example.com [--media /mounted/nas/sanzo/media]');
const data=resolve(config.DATA_DIR||'.sanzo-data'),media=resolve(get('media')||config.MEDIA_ROOT||resolve(data,'media'));
const marker=await initializeMedia(media);await mkdir(data,{recursive:true,mode:0o700});
const DB=new SQLiteDB(resolve(data,'sanzo.sqlite'));await migrate(DB);
try{
 const admin=await DB.prepare("SELECT user_id FROM auth_accounts WHERE role='admin'").first();
 if(!admin){const invite=await createInvite(DB,email,{role:'admin'});const link=(config.PUBLIC_ORIGIN||'http://127.0.0.1:4173')+'/login/#invite='+invite.token;
  await writeFile(resolve(data,'admin-setup.txt'),'管理员设置密码链接（24 小时有效，仅可使用一次）：\n'+link+'\n',{mode:0o600,flag:'wx'});
  console.log('管理员设置链接已写入 '+resolve(data,'admin-setup.txt'));
 }else console.log('管理员账号已存在，未重置密码。');
 let source=await readFile('.env.local','utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 const updates={DATA_DIR:data,MEDIA_ROOT:media,MEDIA_STORAGE_ID:marker,PUBLIC_ORIGIN:config.PUBLIC_ORIGIN||'http://127.0.0.1:4173'};
 for(const [key,value] of Object.entries(updates)){const re=new RegExp('^'+key+'=.*$','m');source=re.test(source)?source.replace(re,key+'='+value):source.replace(/\s*$/,'')+'\n'+key+'='+value+'\n';}
 await writeFile('.env.local',source,{mode:0o600});await chmod('.env.local',0o600);console.log('独立账号、SQLite 和媒体目录已初始化。');
}finally{DB.close();}
