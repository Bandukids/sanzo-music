import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, transform } from 'esbuild';
import {versionFrontendAssets} from './frontend-versioning.mjs';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
let sourceBytes=0,optimizedBytes=0;
async function optimizeText(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=resolve(directory,entry.name);
    if(entry.isDirectory()){if(entry.name!=='vendor')await optimizeText(file);continue;}
    const loader=entry.name.endsWith('.js')?'js':entry.name.endsWith('.css')?'css':null;
    if(!loader)continue;
    const source=await readFile(file,'utf8');
    const result=await transform(source,{loader,minify:true,target:'es2022',legalComments:'eof'});
    sourceBytes+=Buffer.byteLength(source);optimizedBytes+=Buffer.byteLength(result.code);
    await writeFile(file,result.code);
  }
}
await mkdir(resolve(dist, 'client'), { recursive: true });
for (const entry of await readdir(dist, { withFileTypes: true })) {
  if (['client', 'server', '.openai', '_appgen_meta'].includes(entry.name)) continue;
  await cp(resolve(dist, entry.name), resolve(dist, 'client', entry.name), { recursive: true });
}
const frontendVersion=await versionFrontendAssets(resolve(dist,'client'));
await optimizeText(resolve(dist,'client'));
await mkdir(resolve(dist, 'server'), { recursive: true });
await build({entryPoints:[resolve(root,'worker/index.js')],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(dist,'server/index.js')});
await writeFile(resolve(dist, 'server/wrangler.json'), JSON.stringify({ name: 'sanzo-ai-music', main: 'index.js', compatibility_date: '2026-10-03', assets: { directory: '../client', binding: 'ASSETS', run_worker_first: ['/api/*'] } }, null, 2));
await mkdir(resolve(dist, '.openai'), { recursive: true });
await cp(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(dist,'.openai/drizzle'),{recursive:true});
console.log('Built frontend assets and private AI service.');
console.log('Frontend asset version: '+frontendVersion);
console.log(`Frontend JS/CSS: ${sourceBytes} → ${optimizedBytes} bytes (${Math.round((1-optimizedBytes/sourceBytes)*100)}% smaller).`);
