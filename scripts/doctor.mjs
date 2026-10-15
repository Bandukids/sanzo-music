import {loadConfig} from '../server/config.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
const env=await selfHostedStorage(loadConfig());
try{
 const integrity=await env.DB.prepare('PRAGMA integrity_check').first();if(integrity.integrity_check!=='ok')throw Error('SQLite integrity check failed');
 if((await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length)throw Error('Foreign key check failed');
 const assets=(await env.DB.prepare("SELECT id,object_key,bytes FROM assets WHERE status='ready'").all()).results;
 for(const row of assets){const info=await env.BUCKET.head(row.object_key);if(!info||info.size!==row.bytes)throw Error('Missing or incomplete media: '+row.id);}
 const mismatched=(await env.DB.prepare("SELECT id FROM users WHERE bytes<>COALESCE((SELECT SUM(bytes) FROM assets WHERE owner=users.id),0)").all()).results;
 if(mismatched.length)throw Error('Storage accounting mismatch; restart the single application instance to recover interrupted uploads.');
 console.log(JSON.stringify({ok:true,files:assets.length,bytes:assets.reduce((sum,a)=>sum+a.bytes,0)}));
}finally{await env.runtime.dispose();}
