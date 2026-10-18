import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import http from 'node:http';
import {loadConfig} from '../server/config.mjs';
import {backupSettings} from './backup-docker.mjs';
import {FileBucket} from '../server/file-bucket.mjs';
import {redactOperationalText} from '../server/operations.mjs';
const config=loadConfig(),settings=await backupSettings(),run=promisify(execFile);
const report={checkedAt:new Date().toISOString(),application:null,nas:null,tunnel:null,backup:null};
const docker=async args=>(await run('/opt/homebrew/bin/docker',['--context',settings.context,...args],{encoding:'utf8',timeout:10000,maxBuffer:262144})).stdout;
async function app(){try{const data=JSON.parse(await docker(['inspect','--format','{{json .State}}','sanzo-app-1']));report.application={status:data.Running?'running':'stopped',health:data.Health?.Status||'unknown',startedAt:data.StartedAt,exitCode:data.ExitCode};if(process.argv.includes('--logs')){const result=await run('/opt/homebrew/bin/docker',['--context',settings.context,'logs','--tail','30','sanzo-app-1'],{encoding:'utf8',timeout:10000,maxBuffer:262144});report.recentLogs=(result.stdout+'\n'+result.stderr).split('\n').filter(Boolean).slice(-30).map(line=>redactOperationalText(line,config));}}catch{report.application={status:'unavailable',message:'Docker/Colima 未运行，或应用容器无法访问。'};}}
async function nas(){try{await new FileBucket(settings.mediaRoot,settings.storageId).check();report.nas={status:'ok'};}catch{report.nas={status:'error',message:'NAS 挂载或存储标识异常。'};}}
async function tunnel(){try{const response=await fetch('http://127.0.0.1:45301/ready',{signal:AbortSignal.timeout(3000)});await response.body?.cancel();report.tunnel={status:response.ok?'ok':'error',httpStatus:response.status};}catch{report.tunnel={status:'unavailable',message:'Cloudflare Tunnel 本机就绪检查不可达。'};}}
async function backup(){try{const state=JSON.parse(await readFile(resolve(settings.controlDir,'schedule-status.json'),'utf8'));report.backup={status:state.status,lastSuccess:state.lastSuccess||null,lastAttempt:state.lastAttempt||null,nextAttemptAt:state.nextAttemptAt||null,files:state.files,bytes:state.bytes,snapshot:state.target?basename(state.target):null,error:state.lastError?redactOperationalText(state.lastError,config):null};}catch{report.backup={status:'unavailable',message:'未找到自动备份状态。'};}}
await Promise.all([app(),nas(),tunnel(),backup()]);
report.http=await new Promise(resolve=>{const request=http.get('http://127.0.0.1:4173/healthz',{headers:{Host:new URL(config.PUBLIC_ORIGIN||'http://127.0.0.1:4173').host},timeout:5000},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode===200?'ok':'error',httpStatus:response.statusCode}));});request.on('timeout',()=>request.destroy(Error('timeout')));request.on('error',()=>resolve({status:'unavailable'}));});
console.log(JSON.stringify(report,null,2));
if(report.application.health!=='healthy'||report.nas.status!=='ok'||report.http.status!=='ok')process.exitCode=1;
