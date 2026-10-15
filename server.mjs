import {resolve} from 'node:path';
import {loadConfig} from './server/config.mjs';
import {selfHostedStorage} from './server/self-hosted-storage.mjs';
import {createApp} from './server/http-app.mjs';
import {repairStorage} from './server/storage-repair.mjs';
import {startTaskSync} from './server/task-sync.mjs';
const config=loadConfig();
const env=await selfHostedStorage(config);
await repairStorage(env);
const port=Number(config.PORT||4173),host=config.HOST||'127.0.0.1';
const origin=config.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
const app=createApp({...config,...env},{origin,root:resolve('dist',process.argv.includes('--built')?'client':'')});
const stopSync=startTaskSync({...config,...env});
app.listen(port,host,()=>console.log('Local: '+origin));
let closing=false;
async function close(){if(closing)return;closing=true;app.close(async()=>{await stopSync();await env.runtime.dispose();process.exit(0);});app.closeIdleConnections();setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',close);process.on('SIGINT',close);
