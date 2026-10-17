import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {communityAudio} from '../dist/community-audio.js';
import {backupSettings} from '../scripts/backup-docker.mjs';
const settings=await backupSettings(),ids=Object.values(communityAudio).map(track=>track.releaseId);
const script=`const {DatabaseSync}=require('node:sqlite');const {createHash}=require('node:crypto');const d=new DatabaseSync('/data/sanzo.sqlite',{readOnly:true});console.log(JSON.stringify(${JSON.stringify(ids)}.map(id=>{const row=d.prepare("SELECT a.object_key,a.bytes FROM generations g JOIN assets a ON a.id=g.asset_id AND a.owner=g.owner WHERE g.id=? AND a.status='ready'").get(id);if(!row)throw Error('Missing ready audio');return {id,key:row.object_key,bytes:row.bytes};})));d.close();`;
const rows=JSON.parse(execFileSync('/opt/homebrew/bin/docker',['--context','colima-sanzo','exec','sanzo-app-1','node','-e',script],{encoding:'utf8'}));
const {FileBucket}=await import('../server/file-bucket.mjs');const bucket=new FileBucket(settings.mediaRoot,settings.storageId);
const measured=[];
for(const [id,entry] of Object.entries(communityAudio)){
 const row=rows.find(row=>row.id===entry.releaseId),path=bucket.paths(row.key).file;
 const info=execFileSync('/usr/bin/afinfo',[path],{encoding:'utf8',timeout:30000,maxBuffer:65536});
 const duration=Number(/estimated duration:\s*([\d.]+)/i.exec(info)?.[1]);
 if(!Number.isFinite(duration)||duration<20||duration>360||!/MP3|\.mp3/i.test(info))throw Error('Invalid MP3 metadata: '+id);
 entry.duration=Math.round(duration*100)/100;entry.bytes=row.bytes;measured.push({id,duration:entry.duration,bytes:row.bytes,valid:true});
}
await writeFile(resolve('dist/community-audio.js'),'// YUE2 audio stored on NAS and published through verified release endpoints.\nexport const communityAudio = '+JSON.stringify(communityAudio,null,2)+';\n');
await writeFile(resolve('.sanzo-data/community-audio-validation.json'),JSON.stringify({passed:true,tracks:measured,checkedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({verified:measured.length,totalBytes:measured.reduce((sum,row)=>sum+row.bytes,0),durationRange:[Math.min(...measured.map(row=>row.duration)),Math.max(...measured.map(row=>row.duration))]}));
