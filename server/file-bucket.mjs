import {access,readFile,writeFile,mkdir,rm,stat,realpath,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';

export const storageError=()=>Object.assign(Error('媒体存储不可用，请检查 NAS 挂载后重试。'),{status:503,code:'STORAGE_OFFLINE'});
export class FileBucket {
 constructor(root,marker){this.root=resolve(root);this.marker=marker;this.probe=null;}
 async check() {
  // SMB calls can stall during a real network outage. Keep only one physical
  // probe in flight and return promptly instead of filling the I/O thread pool.
  if(!this.probe)this.probe=(async()=>{if(!this.marker||await readFile(resolve(this.root,'.sanzo-storage-id'),'utf8')!==this.marker+'\n')throw storageError();await access(this.root,6);})().finally(()=>{this.probe=null;});
  let timer;
  try{await Promise.race([this.probe,new Promise((_,reject)=>{timer=setTimeout(()=>reject(storageError()),3000);})]);return true;}
  catch{throw storageError();}finally{clearTimeout(timer);}
 }
 paths(key){if(typeof key!=='string'||!key||key.length>512||key.split('/').some(p=>!p||p==='.'||p==='..'||!/^[-\w.]+$/.test(p)))throw Error('Invalid object key');const id=createHash('sha256').update(key).digest('hex');return {file:resolve(this.root,'objects',id.slice(0,2),id),meta:resolve(this.root,'objects',id.slice(0,2),id+'.json')};}
 async safeParent(file,create=false){const base=await realpath(this.root);if(create)await mkdir(dirname(file),{recursive:true,mode:0o700});const parent=await realpath(dirname(file));if(!parent.startsWith(base+sep))throw storageError();}
 async head(key){
  await this.check();const {file,meta}=this.paths(key);
  try{await this.safeParent(file);const info=JSON.parse(await readFile(meta,'utf8')),s=await stat(file);if(s.size!==info.size)throw storageError();return {...info,httpEtag:'"'+info.etag+'"'};}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 async get(key,options={}){
  const info=await this.head(key);if(!info)return null;const {file}=this.paths(key);
  const range=options.range;const start=range?.offset??0,length=range?.length??info.size;
  if(start<0||length<0||start+length>info.size)throw Error('Invalid object range');
  const body=length?Readable.toWeb(createReadStream(file,{start,end:start+length-1})):new ReadableStream({start(c){c.close();}});
  return {...info,body,arrayBuffer:()=>new Response(body).arrayBuffer(),text:()=>new Response(body).text(),json:()=>new Response(body).json(),...(range?{range:{offset:start,length}}:{})};
 }
 async put(key,payload,options={}){
  await this.check();const {file,meta}=this.paths(key);await this.safeParent(file,true);await this.check();
  const hash=createHash('sha256');let size=0,created=false,createdMeta=false;
  try{
   // Object keys are immutable. The database publishes the asset only after
   // both files have been synced; rename on SMB through VirtioFS is unreliable.
   const handle=await open(file,'wx',0o600);created=true;
   const source=payload instanceof ReadableStream?Readable.fromWeb(payload):Readable.from([payload]);
   try{for await(const raw of source){const chunk=Buffer.from(raw);size+=chunk.length;if(size>104857600)throw Error('Object exceeds 100 MiB');hash.update(chunk);await handle.writeFile(chunk);}await handle.sync();}
   finally{await handle.close();}
   const info={key,size,etag:hash.digest('hex'),httpMetadata:options.httpMetadata||{}};
   const metadata=await open(meta,'wx',0o600);createdMeta=true;
   try{await metadata.writeFile(JSON.stringify(info));await metadata.sync();}finally{await metadata.close();}
   await this.check();return {...info,httpEtag:'"'+info.etag+'"'};
  }catch(error){if(createdMeta)await rm(meta,{force:true}).catch(()=>{});if(created)await rm(file,{force:true}).catch(()=>{});throw error;}
 }
 async delete(key){await this.check();const {file,meta}=this.paths(key);try{await this.safeParent(file);await rm(file,{force:true});await rm(meta,{force:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
}

export async function initializeMedia(root){
 await mkdir(root,{recursive:true,mode:0o700});const markerFile=resolve(root,'.sanzo-storage-id');
 try{return (await readFile(markerFile,'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;}
 const id=randomUUID();await writeFile(markerFile,id+'\n',{flag:'wx',mode:0o600});return id;
}
