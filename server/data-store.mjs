export const STORAGE_LIMIT = 1024 * 1024 * 1024;
export const FILE_LIMIT = 100 * 1024 * 1024;
export class DataStore {
 constructor(db) { this.db = db; }
 statement(sql, ...values) { return this.db.prepare(sql).bind(...values); }
 async profile(user) {
  const now = new Date().toISOString();
  await this.statement('INSERT INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email', user.id,user.email,user.name,now,now).run();
  const profile=await this.statement('SELECT id,email,name,bytes,created_at,updated_at FROM users WHERE id=?',user.id).first();
  if(this.db.selfHosted)profile.quota=await this.db.quota(user.id);
  return profile;
 }
 async rename(id, name) { await this.statement('UPDATE users SET name=?,updated_at=? WHERE id=?',name,new Date().toISOString(),id).run(); }
 async document(owner, namespace) { const r=await this.statement('SELECT data,revision,updated_at FROM documents WHERE owner=? AND namespace=?',owner,namespace).first();return r?{data:JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at}:{data:null,revision:0}; }
 async save(owner, namespace, data, revision) {
  const result=revision===0
   ? await this.statement('INSERT INTO documents (owner,namespace,data,revision,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(owner,namespace) DO NOTHING',owner,namespace,JSON.stringify(data),new Date().toISOString()).run()
   : await this.statement('UPDATE documents SET data=?,revision=revision+1,updated_at=? WHERE owner=? AND namespace=? AND revision=?',JSON.stringify(data),new Date().toISOString(),owner,namespace,revision).run();
  return result.meta.changes>0;
 }
 async asset(owner,id) { return this.statement("SELECT * FROM assets WHERE owner=? AND id=? AND status='ready'",owner,id).first(); }
 async assets(owner) { return (await this.statement("SELECT id,name,mime,bytes,kind,created_at FROM assets WHERE owner=? AND status='ready' ORDER BY created_at DESC",owner).all()).results; }
 async reserve(owner,bytes) { if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('Invalid storage reservation');const limit=this.db.selfHosted?'COALESCE((SELECT quota_bytes FROM auth_accounts WHERE user_id=users.id),?)':'?';return (await this.statement('UPDATE users SET bytes=bytes+? WHERE id=? AND bytes+?<='+limit,bytes,owner,bytes,STORAGE_LIMIT).run()).meta.changes>0; }
 async release(owner,bytes) { await this.statement('UPDATE users SET bytes=MAX(0,bytes-?) WHERE id=?',bytes,owner).run(); }
 async startAsset(owner,id,key,name,mime,bytes,kind) { await this.statement("INSERT INTO assets (owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES (?,?,?,?,?,?,?,'uploading',?)",owner,id,key,name,mime,bytes,kind,new Date().toISOString()).run(); }
 async finishAsset(owner,id) { await this.statement("UPDATE assets SET status='ready' WHERE owner=? AND id=?",owner,id).run(); }
 async cancelAsset(owner,id) { await this.statement("DELETE FROM assets WHERE owner=? AND id=? AND status='uploading'",owner,id).run(); }
}
