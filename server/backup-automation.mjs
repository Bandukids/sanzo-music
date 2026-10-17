import {mkdir,readFile,writeFile,rename,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

export const BACKUP_MANAGER='sanzo-scheduled-backup-v1';
const DAY=86400000,OFFSET=8*3600000;
export const chinaDay=time=>new Date(new Date(time).getTime()+OFFSET).toISOString().slice(0,10);
export function latestBackupSlot(now=new Date()){
 const local=new Date(now.getTime()+OFFSET);local.setUTCHours(4,0,0,0);
 let slot=local.getTime()-OFFSET;if(slot>now.getTime())slot-=DAY;return new Date(slot);
}
export function backupDue(state,now=new Date()){
 return (!state.lastSuccess||new Date(state.lastSuccess)<latestBackupSlot(now))&&(!state.nextAttemptAt||new Date(state.nextAttemptAt)<=now);
}
function week(time){const day=new Date(chinaDay(time)+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);return day.toISOString().slice(0,10);}
export function retainedBackups(snapshots,{daily=7,weekly=4}={}){
 if(!Number.isInteger(daily)||daily<1||!Number.isInteger(weekly)||weekly<1)throw Error('无效备份保留策略。');
 const keep=new Set(),days=new Set(),weeks=new Set();
 for(const item of [...snapshots].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))){
  const d=chinaDay(item.createdAt),w=week(item.createdAt);
  if(days.size<daily&&!days.has(d)){keep.add(item.name);days.add(d);}
  if(weeks.size<weekly&&!weeks.has(w)){keep.add(item.name);weeks.add(w);}
 }
 return keep;
}
export async function readJSON(path,fallback={}){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
export async function writeJSON(path,value){const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,path);}
const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
const busy=()=>Object.assign(Error('另一个备份进程正在运行，稍后重试。'),{code:'BACKUP_BUSY'});
export async function acquireBackupLock(control){
 await mkdir(control,{recursive:true,mode:0o700});const directory=resolve(control,'backup.lock'),id=randomUUID();
 try{await mkdir(directory,{mode:0o700});}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const owner=await readJSON(resolve(directory,'owner.json'),null);
  if(!owner){const info=await lstat(directory);if(Date.now()-info.mtimeMs<120000)throw busy();}
  if(owner&&alive(owner.pid))throw busy();
  // Only one contender may reap a dead owner. A fresh lock is never removed.
  try{await mkdir(resolve(directory,'reaping'),{mode:0o700});}catch(error){if(error.code==='EEXIST'||error.code==='ENOENT')throw busy();throw error;}
  const current=await readJSON(resolve(directory,'owner.json'),null);
  if(current&&alive(current.pid)){await rm(resolve(directory,'reaping'),{recursive:true});throw busy();}
  const stale=directory+'.stale-'+randomUUID();await rename(directory,stale);await rm(stale,{recursive:true});
  try{await mkdir(directory,{mode:0o700});}catch(error){if(error.code==='EEXIST')throw busy();throw error;}
 }
 await writeJSON(resolve(directory,'owner.json'),{pid:process.pid,id,startedAt:new Date().toISOString()});
 return async()=>{const owner=await readJSON(resolve(directory,'owner.json'),null);if(owner?.id===id)await rm(directory,{recursive:true});};
}
export async function managedBackups(root,storageId){
 const snapshots=[];
 for(const entry of await readdir(root,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(entry.name))continue;
  const path=resolve(root,entry.name);
  try{
   const metadata=await readJSON(resolve(path,'.sanzo-managed.json'),null),manifest=await readJSON(resolve(path,'manifest.json'),null);
   if(metadata?.manager!==BACKUP_MANAGER||metadata.storageId!==storageId||manifest?.storageId!==storageId||manifest.version!==1||!Array.isArray(manifest.assets)||!/^[a-f0-9]{64}$/.test(manifest.databaseSha256||'')||!Number.isFinite(Date.parse(manifest.createdAt)))continue;
   if(await realpath(path)!==resolve(await realpath(root),entry.name))continue;
   snapshots.push({name:entry.name,createdAt:manifest.createdAt});
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 }
 return snapshots;
}
export async function pruneBackups(root,storageId,checkStorage,removeDirectory=path=>rm(path,{recursive:true,maxRetries:8,retryDelay:300})){
 await checkStorage();const snapshots=await managedBackups(root,storageId),keep=retainedBackups(snapshots),removed=[];
 for(const snapshot of snapshots){if(keep.has(snapshot.name))continue;await checkStorage();const path=resolve(root,snapshot.name);if(!(await lstat(path)).isDirectory()||await realpath(path)!==resolve(await realpath(root),snapshot.name))throw Error('备份目录发生变化，停止清理。');await removeDirectory(path);removed.push(snapshot.name);}
 return {kept:keep.size,removed};
}
