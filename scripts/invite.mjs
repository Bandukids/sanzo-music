import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {loadConfig} from '../server/config.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {createInvite,validEmail} from '../server/auth.mjs';
const email=process.argv[2];if(!validEmail(email))throw Error('Usage: node scripts/invite.mjs user@example.com');
const config=loadConfig(),env=await selfHostedStorage(config);
try{const invite=await createInvite(env.DB,email);const file=resolve(env.DATA_DIR,'invite-'+invite.userId+'.txt');await writeFile(file,(config.PUBLIC_ORIGIN||'http://127.0.0.1:4173')+'/login/#invite='+invite.token+'\n',{mode:0o600});console.log('一次性设置链接已写入 '+file);}finally{await env.runtime.dispose();}
