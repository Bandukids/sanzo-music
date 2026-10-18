import {mkdir,copyFile,writeFile,chmod,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {backupSettings} from './backup-docker.mjs';
import {writeJSON} from '../server/backup-automation.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),base=resolve(homedir(),'Library/Application Support/SanzoMusic'),runtime=resolve(base,'backup-runtime'),settings=await backupSettings(project);
const label='com.sanzo.music.backup',agents=resolve(homedir(),'Library/LaunchAgents'),plist=resolve(agents,label+'.plist'),domain='gui/'+process.getuid();
if(process.argv.includes('--uninstall')){try{execFileSync('/bin/launchctl',['bootout',domain+'/'+label],{stdio:'ignore'});}catch{}await rm(plist,{force:true});console.log('自动备份任务已卸载，备份数据和状态记录保留。');process.exit(0);}
await mkdir(runtime,{recursive:true,mode:0o700});await mkdir(settings.controlDir,{recursive:true,mode:0o700});
for(const name of ['scripts/backup-docker.mjs','scripts/scheduled-backup.mjs','scripts/publish-backup-status.mjs','server/backup-automation.mjs','server/backup-state.mjs','server/file-bucket.mjs']){const target=resolve(runtime,name);await mkdir(resolve(target,'..'),{recursive:true,mode:0o700});await copyFile(resolve(project,name),target);await chmod(target,0o600);}
await writeJSON(resolve(runtime,'.backup-settings.json'),settings);
await mkdir(agents,{recursive:true});
const xml=value=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
const source=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>/opt/homebrew/opt/node@24/bin/node</string><string>${xml(resolve(runtime,'scripts/scheduled-backup.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string><key>TZ</key><string>Asia/Shanghai</string></dict>
<key>RunAtLoad</key><true/>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
<key>StartInterval</key><integer>900</integer>
<key>ProcessType</key><string>Background</string>
<key>ExitTimeOut</key><integer>120</integer>
<key>StandardOutPath</key><string>${xml(resolve(settings.controlDir,'launchd.stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(settings.controlDir,'launchd.stderr.log'))}</string>
</dict></plist>\n`;
await writeFile(plist,source,{mode:0o600});await chmod(plist,0o600);execFileSync('/usr/bin/plutil',['-lint',plist],{stdio:'inherit'});
try{execFileSync('/bin/launchctl',['bootout',domain+'/'+label],{stdio:'ignore'});}catch{}
execFileSync('/bin/launchctl',['bootstrap',domain,plist],{stdio:'inherit'});
console.log('自动备份已安装：每日北京时间 04:00；每 15 分钟检查失败重试或补跑。');
console.log('状态目录：'+settings.controlDir);console.log('首次备份已由 launchd 启动。');
console.log('备份状态摘要会自动同步到网站数据库。');
