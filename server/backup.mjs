import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,readdir,stat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {FileBucket} from './file-bucket.mjs';

async function digest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function empty(directory){try{if((await readdir(directory)).length)throw Error('目标目录非空，拒绝覆盖：'+directory);}catch(error){if(error.code!=='ENOENT')throw error;}await mkdir(directory,{recursive:true,mode:0o700});}
export async function backupStorage(env,target){
 target=resolve(target);if(target.startsWith(env.BUCKET.root+'/'))throw Error('备份目录不能放在媒体目录内部。');
 await env.BUCKET.check();await mkdir(target,{recursive:false,mode:0o700});
 const staging=await mkdtemp(resolve(env.DATA_DIR,'backup-stage-'));
 env.DB.raw.exec('BEGIN IMMEDIATE');let reader;
 try{
  const assets=(await env.DB.prepare("SELECT owner,id,object_key,bytes FROM assets WHERE status='ready' ORDER BY owner,id").all()).results;
  const entries=[];const media=resolve(target,'media');await mkdir(media,{mode:0o700});await writeFile(resolve(media,'.sanzo-storage-id'),env.BUCKET.marker+'\n',{mode:0o600});
  for(const asset of assets){const object=await env.BUCKET.head(asset.object_key);if(!object||object.size!==asset.bytes)throw Error('素材缺失或大小不匹配，备份未完成：'+asset.id);
   const from=env.BUCKET.paths(asset.object_key),to=new FileBucket(media,env.BUCKET.marker).paths(asset.object_key);await mkdir(dirname(to.file),{recursive:true,mode:0o700});await copyFile(from.file,to.file);await copyFile(from.meta,to.meta);
   const checksum=await digest(to.file);if(checksum!==object.etag)throw Error('素材校验失败：'+asset.id);entries.push({...asset,sha256:checksum});
  }
  reader=new DatabaseSync(env.DB.filename,{readOnly:true});await backup(reader,resolve(staging,'sanzo.sqlite'));reader.close();reader=null;
  const copy=new DatabaseSync(resolve(staging,'sanzo.sqlite'));
  try{copy.exec("PRAGMA foreign_keys=ON; DELETE FROM assets WHERE status='uploading'; UPDATE users SET bytes=COALESCE((SELECT SUM(bytes) FROM assets WHERE owner=users.id AND status='ready'),0); DELETE FROM auth_sessions; DELETE FROM auth_attempts; UPDATE generations SET lease_until=0; UPDATE covers SET lease_until=0;");}finally{copy.close();}
  await copyFile(resolve(staging,'sanzo.sqlite'),resolve(target,'sanzo.sqlite'));
  const manifest={version:1,createdAt:new Date().toISOString(),storageId:env.BUCKET.marker,databaseSha256:await digest(resolve(target,'sanzo.sqlite')),assets:entries};
  await env.BUCKET.check();await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  return {target,files:entries.length,bytes:entries.reduce((sum,a)=>sum+a.bytes,0)};
 }finally{reader?.close();env.DB.raw.exec('ROLLBACK');await rm(staging,{recursive:true,force:true});}
}
export async function restoreStorage(source,{dataDir,mediaRoot}){
 source=resolve(source);dataDir=resolve(dataDir);mediaRoot=resolve(mediaRoot);
 if(dataDir===mediaRoot||dataDir.startsWith(mediaRoot+'/')||mediaRoot.startsWith(dataDir+'/'))throw Error('数据库与媒体恢复目录必须分开。');
 const manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.assets)||typeof manifest.storageId!=='string')throw Error('无效备份清单。');
 const staging=await mkdtemp(resolve(tmpdir(),'sanzo-restore-'));
 try{
  // Never open SQLite on SMB, even when validating an otherwise read-only backup.
  const database=resolve(staging,'sanzo.sqlite');await copyFile(resolve(source,'sanzo.sqlite'),database);
  if(await digest(database)!==manifest.databaseSha256)throw Error('数据库备份校验失败。');
  const origin=new FileBucket(resolve(source,'media'),manifest.storageId);await origin.check();
  const db=new DatabaseSync(database,{readOnly:true});
  try{
   if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('数据库完整性检查失败。');
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('数据库外键检查失败。');
   const rows=db.prepare("SELECT owner,id,object_key,bytes FROM assets WHERE status='ready' ORDER BY owner,id").all();
   if(JSON.stringify(rows.map(r=>({...r})))!==JSON.stringify(manifest.assets.map(({owner,id,object_key,bytes})=>({owner,id,object_key,bytes}))))throw Error('数据库与素材清单不匹配。');
  }finally{db.close();}
  for(const asset of manifest.assets){const info=await origin.head(asset.object_key);if(!info||info.size!==asset.bytes||await digest(origin.paths(asset.object_key).file)!==asset.sha256||info.etag!==asset.sha256)throw Error('素材备份校验失败：'+asset.id);}
  await empty(dataDir);await empty(mediaRoot);const destination=new FileBucket(mediaRoot,manifest.storageId);
  for(const asset of manifest.assets){const from=origin.paths(asset.object_key),to=destination.paths(asset.object_key);await mkdir(dirname(to.file),{recursive:true,mode:0o700});await copyFile(from.file,to.file);await copyFile(from.meta,to.meta);if(await digest(to.file)!==asset.sha256)throw Error('恢复写入校验失败：'+asset.id);}
  await copyFile(database,resolve(dataDir,'sanzo.sqlite'));
  await writeFile(resolve(mediaRoot,'.sanzo-storage-id'),manifest.storageId+'\n',{mode:0o600});
  return {storageId:manifest.storageId,files:manifest.assets.length};
 }finally{await rm(staging,{recursive:true,force:true});}
}
