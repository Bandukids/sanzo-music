import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {communityTracks} from '../dist/music-catalog.js';
import {communityLyrics} from '../dist/demo-lyrics.js';
if(!process.argv.includes('--run'))throw Error('本命令会使用 RunningHub 额度。明确添加 --run 开始或继续同一批任务。');
const root=resolve(import.meta.dirname,'..'),stateDir=resolve(root,'.sanzo-data');await mkdir(stateDir,{recursive:true,mode:0o700});
const palettes={
 chill:'Mellow lo-fi pop, warm Rhodes piano, soft dusty drums, rounded bass, intimate Mandarin vocals, relaxed late-night mood, organic tape warmth, spacious polished mix',
 electronic:'Dreamy synth-pop, flowing analogue synth arpeggios, deep warm bass, elegant electronic drums, expressive Mandarin vocals, neon city atmosphere, clear chorus melody, polished balanced production',
 ambient:'Atmospheric ambient pop, gentle piano, slow evolving pads, restrained percussion, airy Mandarin vocals, wide oceanic reverb, delicate dynamics, peaceful expressive melody',
 pop:'Warm acoustic indie pop, bright fingerpicked guitar, light live drums, melodic bass, natural Mandarin vocals, coastal summer atmosphere, memorable uplifting chorus, clean organic production',
 jazz:'Late-night vocal jazz, mellow acoustic piano, brushed drums, upright bass, soulful Mandarin vocals, intimate small-room ambience, rich jazz harmony, tasteful restrained arrangement',
 cinematic:'Cinematic orchestral pop, intimate piano opening, layered strings, soft rhythmic pulse, soaring Mandarin vocals, gradual emotional build, wide luminous soundstage, detailed balanced arrangement'
};
const catalogue=communityTracks.map(track=>{const lines=communityLyrics[track.id];if(!lines?.length)throw Error('缺少原创歌词：'+track.id);return{id:track.id,input:{model:'yue2',title:track.title,description:track.prompt,styles:palettes[track.style]+'. '+track.title,lyrics:'[Verse 1]\n'+lines.slice(0,4).join('\n')+'\n\n[Chorus]\n'+lines.slice(4).join('\n'),language:'zh',gender:'auto',instrumental:false,backgroundMusic:true,workspace:'community',mode:'custom'}};});
const source=await readFile(resolve(root,'scripts/community-generation-worker.mjs'),'utf8'),entries={};
const processState={startedAt:new Date().toISOString(),total:catalogue.length,tracks:{},passed:false};
const child=spawn('/opt/homebrew/bin/docker',['--context','colima-sanzo','exec','-i','sanzo-app-1','node','--input-type=module','-'],{cwd:root,stdio:['pipe','pipe','pipe']});
child.stdin.end('const catalogue='+JSON.stringify(catalogue)+';\n'+source);
let buffer='',writes=Promise.resolve();
child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{continue;}
 if(event.id)processState.tracks[event.id]=event;if(event.event==='completed')entries[event.id]=event.entry;
 if(event.event==='finished'){processState.passed=event.passed;processState.finishedAt=event.at;}
 if(event.event!=='progress'||event.error)console.log(JSON.stringify(event));
 writes=writes.then(async()=>{const temp=resolve(stateDir,'community-generation.json.tmp');await writeFile(temp,JSON.stringify(processState,null,2)+'\n',{mode:0o600});await rename(temp,resolve(stateDir,'community-generation.json'));});
}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});await writes;
if(code!==0||!processState.passed||Object.keys(entries).length!==catalogue.length)throw Error('部分任务未完成，状态已保存。保留现有音频与任务，重跑本命令不会重复提交。');
const manifest='// YUE2 audio stored on NAS and published through verified release endpoints.\nexport const communityAudio = '+JSON.stringify(entries,null,2)+';\n';
await writeFile(resolve(root,'dist/community-audio.js'),manifest);
console.log('已准备全部 '+catalogue.length+' 首 YUE2 音频，原有封面保持不变。');
