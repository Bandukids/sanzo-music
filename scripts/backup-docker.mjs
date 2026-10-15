import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadConfig} from '../server/config.mjs';
import {FileBucket} from '../server/file-bucket.mjs';
const config=loadConfig();const settings=Object.fromEntries((await readFile('.deploy.env','utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const media=settings.NAS_MEDIA_ROOT;await new FileBucket(media,config.MEDIA_STORAGE_ID).check();
const backups=resolve(media,'../backups');await mkdir(backups,{recursive:true});
const name=new Date().toISOString().replace(/[:.]/g,'-'),volume=settings.SANZO_DB_VOLUME||'sanzo_db';
const env={...process.env,DOCKER_CONTEXT:'colima-sanzo',PATH:'/opt/homebrew/bin:'+process.env.PATH};
const docker=(args,options={})=>execFileSync('/opt/homebrew/bin/docker',args,{env,encoding:'utf8',...options});
const compose=args=>execFileSync('/opt/homebrew/bin/docker-compose',['--env-file','.deploy.env',...args],{env,stdio:'inherit'});
docker(['volume','inspect',volume],{stdio:'ignore'});
const running=execFileSync('/opt/homebrew/bin/docker-compose',['--env-file','.deploy.env','ps','--status','running','-q','app'],{env,encoding:'utf8'}).trim();
try{
 if(running)compose(['stop','app']);
 const output=docker(['run','--rm','--user',settings.SANZO_UID+':'+settings.SANZO_GID,'-e','MEDIA_STORAGE_ID='+config.MEDIA_STORAGE_ID,'-v',volume+':/data','--mount','type=bind,source='+media+',target=/media','--mount','type=bind,source='+backups+',target=/backups','sanzo-music:local','node','scripts/backup.mjs','--to','/backups/'+name]);
 const result={...JSON.parse(output.trim()),target:resolve(backups,name)};await writeFile('.sanzo-data/last-backup.json',JSON.stringify(result,null,2),{mode:0o600});console.log('备份完成：'+result.target);
}finally{if(running)compose(['up','-d','--wait','app']);}
