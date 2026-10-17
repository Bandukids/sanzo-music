import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';

const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const tunnel=option('--tunnel'),hostname=option('--hostname');
if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(tunnel||'')||!hostname||hostname.length>253||!hostname.includes('.')||!hostname.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw Error('请提供有效的 --tunnel UUID 和 --hostname 域名。');
const base=resolve(homedir(),'Library/Application Support/SanzoMusic/cloudflared'),label='com.sanzo.music.tunnel',domain='gui/'+process.getuid();
const config=resolve(base,'config.yml'),credentials=resolve(base,'credentials.json'),agents=resolve(homedir(),'Library/LaunchAgents'),plist=resolve(agents,label+'.plist');
const data=JSON.parse(await readFile(resolve(homedir(),'.cloudflared',tunnel+'.json'),'utf8'));
if(data.TunnelID!==tunnel||typeof data.TunnelSecret!=='string'||!data.TunnelSecret||typeof data.AccountTag!=='string'||!data.AccountTag)throw Error('隧道凭据不匹配。');
await mkdir(base,{recursive:true,mode:0o700});await chmod(base,0o700);
try{const old=await readFile(config,'utf8');if(!old.includes('tunnel: '+tunnel+'\n')||!old.includes('hostname: '+hostname+'\n'))throw Error('现有服务属于其他隧道或域名，拒绝覆盖。');}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(credentials,JSON.stringify(data)+'\n',{mode:0o600});await chmod(credentials,0o600);
await writeFile(config,`tunnel: ${tunnel}\ncredentials-file: ${JSON.stringify(credentials)}\nprotocol: http2\nedge-ip-version: "4"\nmetrics: 127.0.0.1:45301\ningress:\n  - hostname: ${hostname}\n    service: http://127.0.0.1:4173\n  - service: http_status:404\n`,{mode:0o600});await chmod(config,0o600);
execFileSync('/opt/homebrew/bin/cloudflared',['tunnel','--config',config,'ingress','validate'],{stdio:'inherit'});
await mkdir(agents,{recursive:true});
const xml=value=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
const args=['/opt/homebrew/bin/cloudflared','tunnel','--config',config,'--no-autoupdate','run',tunnel];
await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(value=>'<string>'+xml(value)+'</string>').join('')}</array>
<key>WorkingDirectory</key><string>${xml(base)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(resolve(base,'stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(base,'stderr.log'))}</string>
</dict></plist>\n`,{mode:0o600});await chmod(plist,0o600);
execFileSync('/usr/bin/plutil',['-lint',plist],{stdio:'inherit'});
try{execFileSync('/bin/launchctl',['bootout',domain+'/'+label],{stdio:'ignore'});}catch{}
execFileSync('/bin/launchctl',['bootstrap',domain,plist],{stdio:'inherit'});
console.log('正式隧道服务已安装：https://'+hostname);
console.log('配置和日志：'+base);
