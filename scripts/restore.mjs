import {resolve} from 'node:path';
import {restoreStorage} from '../server/backup.mjs';
const get=name=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:undefined;};
if(!get('from')||!get('data')||!get('media'))throw Error('Usage: node scripts/restore.mjs --from SNAPSHOT --data EMPTY_LOCAL_DIR --media EMPTY_MEDIA_DIR');
const result=await restoreStorage(get('from'),{dataDir:get('data'),mediaRoot:get('media')});
console.log('恢复完成；更新运行配置后启动，所有用户需重新登录。');
console.log('DATA_DIR='+resolve(get('data'))+'\nMEDIA_ROOT='+resolve(get('media'))+'\nMEDIA_STORAGE_ID='+result.storageId);
