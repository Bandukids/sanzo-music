import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {BACKUP_MANAGER,chinaDay,latestBackupSlot,backupDue,retainedBackups,managedBackups,pruneBackups,acquireBackupLock,writeJSON} from '../server/backup-automation.mjs';
import {backupSettings} from '../scripts/backup-docker.mjs';

async function directory(t){const path=await mkdtemp(resolve(tmpdir(),'sanzo-backup-policy-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
const name=time=>new Date(time).toISOString().replace(/[:.]/g,'-');
async function snapshot(root,time,{managed=true,complete=true,storage='storage-one'}={}){
 const folder=resolve(root,name(time));await mkdir(folder,{recursive:true});
 if(managed)await writeJSON(resolve(folder,'.sanzo-managed.json'),{manager:BACKUP_MANAGER,storageId:storage});
 if(complete)await writeJSON(resolve(folder,'manifest.json'),{version:1,createdAt:new Date(time).toISOString(),storageId:storage,databaseSha256:'a'.repeat(64),assets:[]});
 return folder;
}

test('backup daily slot uses 04:00 China time across UTC and local midnight',()=>{
 assert.equal(chinaDay('2026-10-16T16:00:00Z'),'2026-10-17');
 assert.equal(latestBackupSlot(new Date('2026-10-16T19:59:59Z')).toISOString(),'2026-10-15T20:00:00.000Z');
 assert.equal(latestBackupSlot(new Date('2026-10-16T20:00:00Z')).toISOString(),'2026-10-16T20:00:00.000Z');
 assert.equal(latestBackupSlot(new Date('2026-10-17T16:30:00Z')).toISOString(),'2026-10-16T20:00:00.000Z');
});
test('successful daily backups are not repeated; missed slots catch up and retries wait',()=>{
 const now=new Date('2026-10-17T00:00:00Z');
 assert.equal(backupDue({},now),true);
 assert.equal(backupDue({lastSuccess:'2026-10-16T21:00:00Z'},now),false);
 assert.equal(backupDue({lastSuccess:'2026-10-15T21:00:00Z'},now),true);
 assert.equal(backupDue({nextAttemptAt:'2026-10-17T00:15:00Z'},now),false);
 assert.equal(backupDue({nextAttemptAt:'2026-10-16T23:59:59Z'},now),true);
});
test('retention keeps newest snapshots for seven distinct days and four Monday-based weeks',()=>{
 const snapshots=[];for(let i=0;i<45;i++)for(let h=0;h<2;h++){const createdAt=new Date(Date.parse('2026-10-17T00:00:00Z')-i*86400000+h*3600000).toISOString();snapshots.push({name:name(createdAt),createdAt});}
 const keep=retainedBackups(snapshots);assert.ok(keep.size>=7&&keep.size<=11);
 for(let i=0;i<7;i++)assert.ok(keep.has(name(Date.parse('2026-10-17T01:00:00Z')-i*86400000)));
 assert.ok(!keep.has(name('2026-10-17T00:00:00Z')));
 assert.ok(keep.has(name('2026-10-11T01:00:00Z')));assert.ok(keep.has(name('2026-10-04T01:00:00Z')));assert.ok(keep.has(name('2026-09-27T01:00:00Z')));
 assert.throws(()=>retainedBackups(snapshots,{daily:0,weekly:4}));
});
test('retention only recognizes managed, complete snapshots from the intended NAS',async t=>{
 const root=await directory(t);
 await snapshot(root,'2026-10-17T00:00:00Z');
 await snapshot(root,'2026-10-16T00:00:00Z',{managed:false});
 await snapshot(root,'2026-10-15T00:00:00Z',{complete:false});
 await snapshot(root,'2026-10-14T00:00:00Z',{storage:'different-nas'});
 const target=await directory(t);await symlink(target,resolve(root,name('2026-10-13T00:00:00Z')));
 assert.deepEqual((await managedBackups(root,'storage-one')).map(row=>row.name),[name('2026-10-17T00:00:00Z')]);
});
test('pruning preserves manual and incomplete backups; storage failure prevents any deletion',async t=>{
 const root=await directory(t);for(let i=0;i<45;i++)await snapshot(root,Date.parse('2026-10-17T00:00:00Z')-i*86400000);
 const manual=await snapshot(root,'2026-06-01T00:00:00Z',{managed:false}),incomplete=await snapshot(root,'2026-06-02T00:00:00Z',{complete:false});
 await assert.rejects(pruneBackups(root,'storage-one',async()=>{throw Error('NAS offline');}));
 assert.equal((await managedBackups(root,'storage-one')).length,45);
 let probes=0;const result=await pruneBackups(root,'storage-one',async()=>{probes++;});assert.ok(result.removed.length>0);assert.equal(probes,result.removed.length+1);
 await access(manual);await access(incomplete);await access(resolve(root,name('2026-10-17T00:00:00Z')));
});
test('backup lock excludes concurrent runs and an old releaser cannot remove a new owner',async t=>{
 const root=await directory(t);const release=await acquireBackupLock(root);
 await assert.rejects(acquireBackupLock(root),{code:'BACKUP_BUSY'});await release();
 const second=await acquireBackupLock(root);await release();await assert.rejects(acquireBackupLock(root),{code:'BACKUP_BUSY'});await second();
});
test('dead process locks recover while an incomplete fresh lock remains protected',async t=>{
 const root=await directory(t),lock=resolve(root,'backup.lock');await mkdir(lock);await writeJSON(resolve(lock,'owner.json'),{pid:2147483647,id:'dead'});
 const release=await acquireBackupLock(root);assert.equal(JSON.parse(await readFile(resolve(lock,'owner.json'),'utf8')).pid,process.pid);await release();
 await mkdir(lock);await assert.rejects(acquireBackupLock(root),{code:'BACKUP_BUSY'});
});
test('installed backup settings include no provider credentials and need no project checkout',async t=>{
 const root=await directory(t);await writeFile(resolve(root,'.env.local'),'MEDIA_STORAGE_ID=storage-one\nDEEPSEEK_API_KEY=do-not-copy-provider-key\n');await writeFile(resolve(root,'.deploy.env'),'NAS_MEDIA_ROOT=/nas/sanzo/media\nSANZO_UID=501\nSANZO_GID=20\n');
 const settings=await backupSettings(root);assert.equal(settings.storageId,'storage-one');assert.equal(settings.mediaRoot,'/nas/sanzo/media');assert.ok(!JSON.stringify(settings).includes('provider-key'));
 await writeJSON(resolve(root,'.backup-settings.json'),settings);await rm(resolve(root,'.env.local'));await rm(resolve(root,'.deploy.env'));assert.deepEqual(await backupSettings(root),settings);
});
