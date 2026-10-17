import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';

// Version the complete module graph: changing only the HTML entry point still
// leaves browsers free to reuse an older catalogue or published-music module.
export async function versionFrontendAssets(directory) {
 const sources=new Map();
 async function collect(folder) {
  for(const entry of await readdir(folder,{withFileTypes:true})) {
   const file=join(folder,entry.name);
   if(entry.isDirectory()){if(entry.name!=='vendor')await collect(file);continue;}
   if(/\.(js|css|html)$/.test(entry.name))sources.set(relative(directory,file).split(sep).join('/'),await readFile(file,'utf8'));
  }
 }
 await collect(directory);
 const hash=createHash('sha256').update('sanzo-frontend-v1\0');
 for(const [name,source] of [...sources].sort(([a],[b])=>a.localeCompare(b)))hash.update(name+'\0'+source+'\0');
 const version=hash.digest('hex').slice(0,16);
 function reference(specifier,from) {
  if(!/^(?:\/(?!\/)|\.\.?\/)/.test(specifier))return specifier;
  const url=new URL(specifier,'https://assets.invalid/'+from);
  if(!/\.(js|css)$/.test(url.pathname)||!sources.has(url.pathname.slice(1)))return specifier;
  url.searchParams.set('v',version);
  return specifier.split(/[?#]/)[0]+url.search+url.hash;
 }
 for(const [name,source] of sources) {
  let updated=source;
  if(name.endsWith('.js'))updated=source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\2/g,(match,prefix,quote,specifier)=>prefix+quote+reference(specifier,name)+quote);
  if(name.endsWith('.html'))updated=source.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*)(['"])([^'"]+)\2/gi,(match,prefix,quote,specifier)=>prefix+quote+reference(specifier,name)+quote);
  if(updated!==source)await writeFile(join(directory,name),updated);
 }
 return version;
}
