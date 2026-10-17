import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,access,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backupSettings,performDockerBackup} from './backup-docker.mjs';
import {initializeMedia} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {DataStore} from '../server/data-store.mjs';
import {readJSON,writeJSON} from '../server/backup-automation.mjs';

const production=await backupSettings(),id=Date.now()+'-'+process.pid,project='sanzo-backup-validation-'+id,volume='sanzo_backup_validation_'+id;
const local=resolve('.sanzo-data/backup-validation-'+id),base=resolve(production.mediaRoot,'../validation/backup-automation-'+id),media=resolve(base,'media');
await mkdir(local,{recursive:true});await mkdir(base,{recursive:true});const storageId=await initializeMedia(media);
const settings={...production,mediaRoot:media,storageId,volume,project,controlDir:resolve(local,'control')};
const environment={...process.env,DOCKER_CONTEXT:settings.context},docker=(args,options={})=>execFileSync('/opt/homebrew/bin/docker',args,{env:environment,encoding:'utf8',...options});
const native=await selfHostedStorage({DATA_DIR:resolve(local,'seed'),MEDIA_ROOT:media,MEDIA_STORAGE_ID:storageId}),store=new DataStore(native.DB),bytes=new Uint8Array([73,68,51,8,9]);
await store.profile({id:'backup-test-user',email:'backup@example.test',name:'Backup Test'});await store.reserve('backup-test-user',bytes.length);await store.startAsset('backup-test-user','sample','audio/sample','sample.mp3','audio/mpeg',bytes.length,'upload-music');await native.BUCKET.put('audio/sample',bytes);await store.finishAsset('backup-test-user','sample');await native.DB.snapshot(resolve(local,'seed.sqlite'));await native.runtime.dispose();
let container;const steps=[];
const record=label=>{steps.push({label,passed:true});console.log('PASS '+label);};
try{
 docker(['volume','create',volume]);
 docker(['run','--rm','--user','0','-i','-v',volume+':/data','sanzo-music:local','node','-e',`const f=require('node:fs');f.writeFileSync('/data/sanzo.sqlite',f.readFileSync(0));f.chownSync('/data',${settings.uid},${settings.gid});f.chownSync('/data/sanzo.sqlite',${settings.uid},${settings.gid});`],{input:await readFile(resolve(local,'seed.sqlite'))});
 container=docker(['run','-d','--name',project,'--label','com.docker.compose.project='+project,'--label','com.docker.compose.service=app','--user',settings.uid+':'+settings.gid,'--read-only','--tmpfs','/tmp:size=128m','--health-cmd',`node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,'--health-interval','1s','--health-timeout','5s','--health-start-period','2s','-e','PUBLIC_ORIGIN=http://sanzo-backup.test','-e','MEDIA_STORAGE_ID='+storageId,'-v',volume+':/data','--mount','type=bind,source='+media+',target=/media','sanzo-music:local']).trim();
 for(let i=0;i<40;i++){if(docker(['inspect','--format','{{.State.Health.Status}}',container]).trim()==='healthy')break;if(i===39)throw Error('Test container failed health check');await new Promise(r=>setTimeout(r,500));}
 const first=await performDockerBackup({managed:true,settings});assert.equal(first.files,1);assert.equal(first.bytes,5);const manifest=await readJSON(resolve(first.target,'manifest.json'));assert.equal(manifest.assets[0].sha256,createHash('sha256').update(bytes).digest('hex'));record('Docker and real NAS backup retains media checksum and restores the original container');
 docker(['stop',container]);await writeJSON(resolve(settings.controlDir,'resume-app.json'),{container:container.slice(0,12),job:'sanzo-backup-1-123456789',createdAt:new Date().toISOString()});
 const recovered=await performDockerBackup({managed:true,settings});assert.equal(recovered.files,1);assert.ok(!recovered.retention.warning,recovered.retention.warning);await assert.rejects(access(resolve(settings.controlDir,'resume-app.json')));assert.equal(docker(['inspect','--format','{{.State.Health.Status}}',container]).trim(),'healthy');record('Interrupted backup journal restarts the paused container and completes a fresh backup');
 const runtime=resolve(local,'runtime');for(const file of ['scripts/backup-docker.mjs','scripts/scheduled-backup.mjs','server/backup-automation.mjs','server/file-bucket.mjs']){await mkdir(resolve(runtime,file,'..'),{recursive:true});await copyFile(file,resolve(runtime,file));}
 await writeJSON(resolve(runtime,'.backup-settings.json'),{...settings,storageId:'intentionally-wrong-marker'});
 const started=docker(['inspect','--format','{{.State.StartedAt}}',container]).trim();let failure;
 try{execFileSync(process.execPath,[resolve(runtime,'scripts/scheduled-backup.mjs'),'--now'],{env:environment,encoding:'utf8',stdio:'pipe'});}catch(error){failure=error;}
 assert.equal(failure?.status,1);const state=await readJSON(resolve(settings.controlDir,'schedule-status.json'));assert.equal(state.status,'failed');assert.ok(Date.parse(state.nextAttemptAt)>Date.now());assert.equal(docker(['inspect','--format','{{.State.StartedAt}}',container]).trim(),started);record('NAS marker failure records retry state and never stops the running container');
 await writeJSON(resolve(settings.controlDir,'schedule-status.json'),{lastSuccess:new Date().toISOString(),status:'success'});const before=await readdir(resolve(base,'backups'));
 execFileSync(process.execPath,[resolve(runtime,'scripts/scheduled-backup.mjs')],{env:environment,encoding:'utf8',stdio:'pipe'});assert.deepEqual(await readdir(resolve(base,'backups')),before);record('Same-day scheduler checks do not create duplicate snapshots');
 await writeFile('.sanzo-data/backup-automation-validation.json',JSON.stringify({passed:true,createdAt:new Date().toISOString(),steps,artifacts:base},null,2));
}finally{if(container)docker(['rm','-f',container],{stdio:'ignore'});docker(['volume','rm',volume],{stdio:'ignore'});}
