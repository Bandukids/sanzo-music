import {readFileSync} from 'node:fs';
export function loadConfig(){
 try{for(const line of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/)){
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].trim();
 }}catch(error){if(error.code!=='ENOENT')throw error;}
 return process.env;
}
