import {appendFile,rename,stat,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {backupSettings,performDockerBackup} from './backup-docker.mjs';
import {readJSON,writeJSON,backupDue,latestBackupSlot} from '../server/backup-automation.mjs';
import {publishBackupStatus} from './publish-backup-status.mjs';
const settings=await backupSettings(),path=resolve(settings.controlDir,'schedule-status.json'),log=resolve(settings.controlDir,'schedule.log');
const now=new Date(),state=await readJSON(path,{}),force=process.argv.includes('--now');
if(!force&&!backupDue(state,now)){await publishBackupStatus(settings).catch(error=>console.error(error.message));process.exit(0);}
await mkdir(settings.controlDir,{recursive:true,mode:0o700});
try{if((await stat(log)).size>1048576)await rename(log,log+'.previous');}catch(error){if(error.code!=='ENOENT')throw error;}
const record=async message=>appendFile(log,new Date().toISOString()+' '+message+'\n',{mode:0o600});
await record('开始备份，计划周期 '+latestBackupSlot(now).toISOString());
try{
 const result=await performDockerBackup({managed:true,settings});
 await writeJSON(path,{...state,status:'success',lastAttempt:now.toISOString(),lastSuccess:now.toISOString(),finishedAt:new Date().toISOString(),lastError:null,nextAttemptAt:null,consecutiveFailures:0,target:result.target,files:result.files,bytes:result.bytes,retention:result.retention});
 await record('成功：'+result.target+'；文件 '+result.files+'，字节 '+result.bytes);if(result.retention?.warning)await record('清理警告：'+result.retention.warning);console.log('自动备份成功。');
}catch(error){
 const busy=error.code==='BACKUP_BUSY',nextAttemptAt=new Date(Date.now()+900000).toISOString();
 await writeJSON(path,{...state,status:busy?'deferred':'failed',lastAttempt:now.toISOString(),lastError:error.message,nextAttemptAt,consecutiveFailures:(state.consecutiveFailures||0)+(busy?0:1)});
 await record((busy?'推迟：':'失败：')+error.message+'；下次重试 '+nextAttemptAt);console.error(error.message);
 process.exitCode=busy?75:1;
}
await publishBackupStatus(settings).catch(error=>console.error(error.message));
