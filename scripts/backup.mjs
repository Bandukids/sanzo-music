import {resolve} from 'node:path';
import {loadConfig} from '../server/config.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {backupStorage} from '../server/backup.mjs';
const args=process.argv.slice(2),i=args.indexOf('--to');if(i<0||!args[i+1])throw Error('Usage: node scripts/backup.mjs --to /backup/new-snapshot-directory');
const env=await selfHostedStorage(loadConfig());
try{console.log(JSON.stringify(await backupStorage(env,resolve(args[i+1]))));}finally{await env.runtime.dispose();}
