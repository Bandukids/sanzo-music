import {resolve} from 'node:path';
import {SQLiteDB,migrate} from './sqlite.mjs';
import {FileBucket} from './file-bucket.mjs';

export async function selfHostedStorage(config=process.env){
 const dataDir=resolve(config.DATA_DIR||'.sanzo-data');
 const DB=new SQLiteDB(resolve(dataDir,'sanzo.sqlite'));
 try{await migrate(DB);const BUCKET=new FileBucket(config.MEDIA_ROOT||resolve(dataDir,'media'),config.MEDIA_STORAGE_ID);await BUCKET.check();
  return {DB,BUCKET,LOCAL_PREVIEW:false,SELF_HOSTED:true,DATA_DIR:dataDir,runtime:{dispose:async()=>DB.close()}};
 }catch(error){DB.close();throw error;}
}
