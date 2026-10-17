import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {FileBucket} from '../server/file-bucket.mjs';
import {BACKUP_MANAGER,readJSON,writeJSON,acquireBackupLock,pruneBackups} from '../server/backup-automation.mjs';
const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const parse=source=>Object.fromEntries(source.split(/\r?\n/).map(line=>/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)).filter(Boolean).map(([,key,value])=>[key,value.trim()]));
export async function backupSettings(directory=root){
 const installed=await readJSON(resolve(directory,'.backup-settings.json'),null);if(installed)return installed;
 const deploy=parse(await readFile(resolve(directory,'.deploy.env'),'utf8')),config=parse(await readFile(resolve(directory,'.env.local'),'utf8'));
 return {mediaRoot:deploy.NAS_MEDIA_ROOT,storageId:config.MEDIA_STORAGE_ID,uid:Number(deploy.SANZO_UID),gid:Number(deploy.SANZO_GID),volume:deploy.SANZO_DB_VOLUME||'sanzo_db',context:'colima-sanzo',project:'sanzo',controlDir:resolve(homedir(),'Library/Application Support/SanzoMusic/backup-state')};
}
export async function performDockerBackup({managed=false,settings}={}){
 settings||=await backupSettings();
 if(!settings.mediaRoot||!settings.storageId||!Number.isSafeInteger(settings.uid)||!Number.isSafeInteger(settings.gid))throw Error('备份存储配置不完整。');
 const release=await acquireBackupLock(settings.controlDir),controller=new AbortController();
 const signal=()=>controller.abort();process.once('SIGTERM',signal);process.once('SIGINT',signal);
 const env={...process.env,DOCKER_CONTEXT:settings.context,PATH:'/opt/homebrew/bin:'+process.env.PATH};
 const docker=async(args,options={})=>{const result=await execute('/opt/homebrew/bin/docker',args,{env,encoding:'utf8',maxBuffer:1024*1024,timeout:60000,...options});return result.stdout.trim();};
 const healthy=async id=>{for(let i=0;i<60;i++){const status=await docker(['inspect','--format','{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',id]);if(status==='healthy')return;if(i===59)throw Error('备份后应用未恢复健康，请检查 NAS 与容器。');await new Promise(r=>setTimeout(r,1000));}};
 const journalPath=resolve(settings.controlDir,'resume-app.json');
 const bucket=new FileBucket(settings.mediaRoot,settings.storageId),backups=resolve(settings.mediaRoot,'../backups');
 const name=new Date().toISOString().replace(/[:.]/g,'-'),job='sanzo-backup-'+process.pid+'-'+Date.now();let stopped=false,container,result,image;
 try{
  try{
   await bucket.check();await mkdir(backups,{recursive:true});
   const ids=(await docker(['ps','-aq','--filter','label=com.docker.compose.project='+settings.project,'--filter','label=com.docker.compose.service=app'])).split('\n').filter(Boolean);
   if(ids.length!==1)throw Error('无法唯一定位正式应用容器，拒绝操作。');container=ids[0];
   const mounts=JSON.parse(await docker(['inspect','--format','{{json .Mounts}}',container]));
   if(!mounts.some(m=>m.Destination==='/data'&&m.Type==='volume'&&m.Name===settings.volume)||!mounts.some(m=>m.Destination==='/media'&&resolve(m.Source)===resolve(settings.mediaRoot)))throw Error('正式容器挂载与备份配置不匹配。');
   const recovery=await readJSON(journalPath,null);
   if(recovery){
    if(recovery.container===container){if(/^sanzo-backup-\d+-\d+$/.test(recovery.job))await docker(['rm','-f',recovery.job]).catch(()=>{});await docker(['start',container]);await healthy(container);}
    else await healthy(container);
    await rm(journalPath);console.log('已恢复上次中断备份暂停的应用。');
   }
   image=await docker(['inspect','--format','{{.Image}}',container]);const running=await docker(['inspect','--format','{{.State.Running}}',container])==='true';
   if(running){
    const count=await docker(['exec',container,'node','-e',"const d=new(require('node:sqlite').DatabaseSync)('/data/sanzo.sqlite',{readOnly:true});console.log(d.prepare(\"SELECT (SELECT COUNT(*) FROM generations WHERE status IN ('planning','submitting'))+(SELECT COUNT(*) FROM covers WHERE status IN ('planning','submitting')) AS n\").get().n);d.close();"]);
    if(Number(count)>0)throw Object.assign(Error('有任务正在提交，推迟备份以免中断。'),{code:'BACKUP_BUSY'});
    await writeJSON(journalPath,{container,job,createdAt:new Date().toISOString()});
    console.log('暂停应用以生成一致性备份。');stopped=true;await docker(['stop',container],{signal:controller.signal});
   }
   const output=await docker(['run','--rm','--name',job,'--user',settings.uid+':'+settings.gid,'-e','MEDIA_STORAGE_ID='+settings.storageId,'-v',settings.volume+':/data','--mount','type=bind,source='+settings.mediaRoot+',target=/media','--mount','type=bind,source='+backups+',target=/backups',image,'node','scripts/backup.mjs','--to','/backups/'+name],{timeout:1800000,signal:controller.signal});
   result={...JSON.parse(output),target:resolve(backups,name),createdAt:new Date().toISOString()};
   const manifest=await readJSON(resolve(result.target,'manifest.json'));if(manifest.storageId!==settings.storageId||manifest.version!==1)throw Error('备份完成清单校验失败。');
   if(managed)await writeJSON(resolve(result.target,'.sanzo-managed.json'),{manager:BACKUP_MANAGER,storageId:settings.storageId});
   await writeJSON(resolve(settings.controlDir,'last-backup.json'),result);console.log('备份完成：'+result.target);
  }finally{
   await docker(['rm','-f',job],{timeout:30000}).catch(()=>{});
   if(stopped&&container){await docker(['start',container]);await healthy(container);await rm(journalPath);console.log('正式应用已恢复健康。');}
  }
  if(managed){
   const remove=async path=>{
    const cleanup=job+'-prune';
    const code="const f=require('node:fs/promises');(async()=>{const name=process.argv[1],id=process.argv[2],p='/backups/'+name;if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z$/.test(name)||(await f.realpath(p))!==p||!(await f.lstat(p)).isDirectory())throw Error('Unsafe backup path');const m=JSON.parse(await f.readFile(p+'/.sanzo-managed.json','utf8')),s=JSON.parse(await f.readFile(p+'/manifest.json','utf8'));if(m.manager!=='sanzo-scheduled-backup-v1'||m.storageId!==id||s.storageId!==id||s.version!==1)throw Error('Backup identity changed');await f.rm(p,{recursive:true,maxRetries:8,retryDelay:300});})().catch(e=>{console.error(e.message);process.exitCode=1;});";
    try{await docker(['run','--rm','--name',cleanup,'--user',settings.uid+':'+settings.gid,'--mount','type=bind,source='+backups+',target=/backups',image,'node','-e',code,basename(path),settings.storageId],{timeout:120000});}finally{await docker(['rm','-f',cleanup],{timeout:30000}).catch(()=>{});}
   };
   try{result.retention=await pruneBackups(backups,settings.storageId,()=>bucket.check(),remove);}catch(error){result.retention={warning:error.message};console.error('备份成功，旧快照清理未完成：'+error.message);}
  }
  return result;
 }finally{process.off('SIGTERM',signal);process.off('SIGINT',signal);await release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await performDockerBackup({managed:process.argv.includes('--managed')});}catch(error){console.error(error.message);process.exitCode=error.code==='BACKUP_BUSY'?75:1;}
}
