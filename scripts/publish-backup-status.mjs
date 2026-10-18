import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readJSON} from '../server/backup-automation.mjs';
import {backupStatePayload} from '../server/backup-state.mjs';
// Host-side bridge, also installed with the existing backup job. The application
// only reads the resulting database setting; it receives no host or Docker access.
export async function publishBackupStatus(settings){
 const [schedule,latest]=await Promise.all([readJSON(resolve(settings.controlDir,'schedule-status.json'),null),readJSON(resolve(settings.controlDir,'last-backup.json'),null)]);
 const payload=backupStatePayload(schedule,latest),env={...process.env,DOCKER_CONTEXT:settings.context};
 const docker=(args,options={})=>execFileSync('/opt/homebrew/bin/docker',args,{env,encoding:'utf8',timeout:15000,maxBuffer:131072,...options}).trim();
 const code=`const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');if(!fs.existsSync('/data/sanzo.sqlite'))throw Error('Database missing');const value=fs.readFileSync(0,'utf8');if(value.length>131072||JSON.parse(value).version!==1)throw Error('Invalid state');const db=new DatabaseSync('/data/sanzo.sqlite');try{db.exec('PRAGMA busy_timeout=5000');db.prepare("INSERT INTO auth_settings(name,value) VALUES('ops_backup_status',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(value);}finally{db.close();}`;
 try{
  const ids=docker(['ps','-q','--filter','label=com.docker.compose.project='+settings.project,'--filter','label=com.docker.compose.service=app']).split('\n').filter(Boolean);
  if(ids.length===1)docker(['exec','-i',ids[0],'node','-e',code],{input:JSON.stringify(payload)});
  else{
   docker(['volume','inspect',settings.volume]);
   docker(['run','--rm','-i','--network','none','--read-only','--user',settings.uid+':'+settings.gid,'--mount','type=volume,src='+settings.volume+',dst=/data','--entrypoint','node','sanzo-music:local','-e',code],{input:JSON.stringify(payload)});
  }
 }catch{throw Error('备份状态暂未同步到数据库，备份文件与宿主机状态仍保留。');}
 return {published:true,publishedAt:payload.publishedAt};
}
