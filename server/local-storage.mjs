import { Miniflare } from 'miniflare';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function localStorageEnvironment() {
 const root=resolve(import.meta.dirname,'..');
 const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("Local storage")}}',compatibilityDate:'2025-10-01',d1Databases:{DB:'sanzo-local'},r2Buckets:['BUCKET'],d1Persist:resolve(root,'.sites-runtime/d1'),r2Persist:resolve(root,'.sites-runtime/r2')});
 const DB=await runtime.getD1Database('DB'),BUCKET=await runtime.getR2Bucket('BUCKET');
 await DB.prepare('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)').run();
 for(const name of (await readdir(resolve(root,'drizzle'))).filter(x=>x.endsWith('.sql')).sort()){
  if(await DB.prepare('SELECT name FROM _local_migrations WHERE name=?').bind(name).first())continue;
  const sql=await readFile(resolve(root,'drizzle',name),'utf8');
  const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s));
  await DB.batch([...statements,DB.prepare('INSERT INTO _local_migrations (name) VALUES (?)').bind(name)]);
 }
 return {DB,BUCKET,LOCAL_PREVIEW:true,runtime};
}
