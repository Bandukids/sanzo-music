import {resolve} from 'node:path';
import {backupSettings} from './backup-docker.mjs';
import {readJSON} from '../server/backup-automation.mjs';
const settings=await backupSettings();console.log(JSON.stringify({controlDirectory:settings.controlDir,schedule:await readJSON(resolve(settings.controlDir,'schedule-status.json'),{status:'not-installed'}),latestBackup:await readJSON(resolve(settings.controlDir,'last-backup.json'),null)},null,2));
