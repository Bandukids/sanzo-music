import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile,rm} from 'node:fs/promises';
import {loadConfig} from '../server/config.mjs';
import {FileBucket} from '../server/file-bucket.mjs';
import {SQLiteDB} from '../server/sqlite.mjs';
const config=loadConfig();const deploy=Object.fromEntries((await readFile('.deploy.env','utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
await new FileBucket(deploy.NAS_MEDIA_ROOT,config.MEDIA_STORAGE_ID).check();
if(deploy.NAS_MEDIA_ROOT.startsWith('/Volumes/')){const mounted=execFileSync('/sbin/mount',{encoding:'utf8'});const volume='/'+deploy.NAS_MEDIA_ROOT.split('/').slice(1,3).join('/');if(!mounted.includes(' on '+volume+' (smbfs,'))throw Error('NAS 未挂载，拒绝启动。');}
const childEnv={...process.env,DOCKER_CONTEXT:'colima-sanzo',PATH:'/opt/homebrew/bin:'+process.env.PATH};
const run=(command,args)=>execFileSync(command,args,{env:childEnv,stdio:'inherit'});
run('/opt/homebrew/bin/colima',['start','sanzo']);
const build=['--env-file','.deploy.env','build'];if(deploy.BUILD_PROXY)build.push('--build-arg','HTTP_PROXY='+deploy.BUILD_PROXY,'--build-arg','HTTPS_PROXY='+deploy.BUILD_PROXY);
run('/opt/homebrew/bin/docker-compose',build);
const volume=deploy.SANZO_DB_VOLUME||'sanzo_db';
run('/opt/homebrew/bin/docker',['volume','create',volume]);
const data=resolve(config.DATA_DIR||'.sanzo-data'),seed=resolve(data,'container-seed.sqlite');
const DB=new SQLiteDB(resolve(data,'sanzo.sqlite'));try{await DB.snapshot(seed);}finally{DB.close();}
try{
 const uid=Number(deploy.SANZO_UID),gid=Number(deploy.SANZO_GID);if(!Number.isSafeInteger(uid)||!Number.isSafeInteger(gid))throw Error('Invalid container UID/GID');
 run('/opt/homebrew/bin/docker',['run','--rm','--user','0','--mount','type=volume,source='+volume+',target=/data','--mount','type=bind,source='+data+',target=/seed,readonly','--entrypoint','node','sanzo-music:local','-e',`const fs=require('node:fs');if(!fs.existsSync('/data/sanzo.sqlite'))fs.copyFileSync('/seed/container-seed.sqlite','/data/sanzo.sqlite');fs.chownSync('/data',${uid},${gid});for(const name of fs.readdirSync('/data'))fs.chownSync('/data/'+name,${uid},${gid});fs.chmodSync('/data/sanzo.sqlite',0o600);`]);
}finally{await rm(seed,{force:true});}
run('/opt/homebrew/bin/docker-compose',['--env-file','.deploy.env','up','-d','--wait']);
console.log('SANZO 已启动：'+config.PUBLIC_ORIGIN);
