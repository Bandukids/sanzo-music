import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadConfig} from '../server/config.mjs';
import {initializeMedia} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {createInvite,handleAuth} from '../server/auth.mjs';
import {restoreStorage} from '../server/backup.mjs';
const config=loadConfig(),id=Date.now()+'-'+randomBytes(3).toString('hex'),name='sanzo-validation-'+id,volumes=['sanzo_validation_'+id,'sanzo_restore_'+id];
const data=resolve('.sanzo-data/validation-'+id),base=resolve(config.MEDIA_ROOT,'../validation/container-'+id),media=resolve(base,'media');
await mkdir(base,{recursive:true});await mkdir(data,{recursive:true});const marker=await initializeMedia(media);
const fixture=await selfHostedStorage({DATA_DIR:data,MEDIA_ROOT:media,MEDIA_STORAGE_ID:marker});
const email='container-test@example.test',password=randomBytes(24).toString('hex');
try{const invite=await createInvite(fixture.DB,email,{role:'admin'});const response=await handleAuth(new Request('http://127.0.0.1:4178/api/auth/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:invite.token,password})}),fixture,null);assert.equal(response.status,200);}finally{await fixture.runtime.dispose();}
const env={...process.env,DOCKER_CONTEXT:'colima-sanzo'},docker=(args,options={})=>execFileSync('/opt/homebrew/bin/docker',args,{env,encoding:'utf8',maxBuffer:8*1024*1024,...options});
const steps=[],record=label=>{steps.push({label,passed:true});console.log('PASS '+label);};
const seed=async(volume,file)=>{docker(['volume','create',volume]);docker(['run','--rm','-i','--user','0','-v',volume+':/data','--entrypoint','node','sanzo-music:local','-e',`const fs=require('node:fs');fs.writeFileSync('/data/sanzo.sqlite',fs.readFileSync(0));fs.chownSync('/data',${process.getuid()},${process.getgid()});fs.chownSync('/data/sanzo.sqlite',${process.getuid()},${process.getgid()});`],{input:await readFile(file)});};
const start=(volume,root)=>docker(['run','-d','--name',name,'--user',process.getuid()+':'+process.getgid(),'--read-only','--tmpfs','/tmp:size=128m','-p','127.0.0.1:4178:4173','-e','PUBLIC_ORIGIN=http://127.0.0.1:4178','-e','MEDIA_STORAGE_ID='+marker,'-v',volume+':/data','--mount','type=bind,source='+root+',target=/media','sanzo-music:local']);
const remove=()=>docker(['rm','-f',name],{stdio:'ignore'});
const call=(path,options={})=>fetch('http://127.0.0.1:4178'+path,{...options,signal:AbortSignal.timeout(10000)});
const wait=async()=>{for(let i=0;i<40;i++){try{if((await call('/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Container failed health check: '+docker(['logs',name]));};
const login=async()=>{const response=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
let markerOffline=false;
try{
 await seed(volumes[0],resolve(data,'sanzo.sqlite'));start(volumes[0],media);await wait();let cookie=await login();
 const account=await (await call('/api/account',{headers:{cookie}})).json();assert.equal(account.storage.limit,1073741824);record('new user default quota is 1 GiB');
 const bytes=new Uint8Array([73,68,51,7,8]);const upload=(asset='container-song')=>call('/api/assets/'+asset,{method:'PUT',headers:{cookie,'X-File-Name':'test.mp3','X-Asset-Kind':'upload-music','Content-Length':String(bytes.length)},body:bytes});
 assert.equal((await upload()).status,201);record('non-root container writes real NAS media');
 assert.equal((await call('/api/assets/container-song')).status,401);const partial=await call('/api/assets/container-song',{headers:{cookie,Range:'bytes=1-3'}});assert.equal(partial.status,206,await partial.clone().text());assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())],[68,51,7]);record('authenticated media and byte ranges');
 const patch=quota=>call('/api/admin/users/'+account.profile.id,{method:'PATCH',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({quotaBytes:quota})});assert.equal((await patch(5)).status,200);assert.equal((await upload('over-quota')).status,413);await patch(1073741824);record('storage quota rejects overflow');
 remove();start(volumes[0],media);await wait();assert.equal((await call('/api/assets/container-song',{headers:{cookie}})).status,200);record('container removal and recreation preserve SQLite sessions and NAS media');
 docker(['exec',name,'node','-e',"require('node:fs').writeFileSync('/media/.sanzo-storage-id','offline\\n')"]);markerOffline=true;
 assert.equal((await call('/healthz')).status,503);assert.equal((await call('/api/generations',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'})).status,503);assert.equal((await upload('offline')).status,503);
 docker(['exec',name,'node','-e',"require('node:fs').writeFileSync('/media/.sanzo-storage-id',"+JSON.stringify(marker+'\n')+")"]);markerOffline=false;await wait();assert.equal((await call('/api/assets/container-song',{headers:{cookie}})).status,200);record('NAS unavailable gate rejects uploads and generation; reconnect retains media');
 remove();
 const result=docker(['run','--rm','--user',process.getuid()+':'+process.getgid(),'-e','MEDIA_STORAGE_ID='+marker,'-v',volumes[0]+':/data','--mount','type=bind,source='+media+',target=/media','--mount','type=bind,source='+base+',target=/backups','sanzo-music:local','node','scripts/backup.mjs','--to','/backups/snapshot']);assert.equal(JSON.parse(result.trim()).files,1);record('offline Docker backup on NAS includes SQLite and media');
 const restoredData=resolve(data,'restored'),restoredMedia=resolve(base,'restored-media');await restoreStorage(resolve(base,'snapshot'),{dataDir:restoredData,mediaRoot:restoredMedia});await seed(volumes[1],resolve(restoredData,'sanzo.sqlite'));start(volumes[1],restoredMedia);await wait();
 assert.equal((await call('/api/account',{headers:{cookie}})).status,401);cookie=await login();const restored=await (await call('/api/account',{headers:{cookie}})).json();assert.equal(restored.storage.used,5);assert.deepEqual([...new Uint8Array(await (await call('/api/assets/container-song',{headers:{cookie}})).arrayBuffer())],[...bytes]);record('fresh Docker volume restore preserves account, quota and file checksum; old sessions revoked');
 await writeFile(resolve('.sanzo-data/container-validation.json'),JSON.stringify({passed:true,createdAt:new Date().toISOString(),steps,artifacts:base},null,2),{mode:0o600});
 console.log('All container validation steps passed.');
}finally{
 if(markerOffline)await writeFile(media+'/.sanzo-storage-id',marker+'\n').catch(()=>{});
 try{remove();}catch{}for(const volume of volumes)try{docker(['volume','rm',volume],{stdio:'ignore'});}catch{}
}
