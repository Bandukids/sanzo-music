import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {readdir, readFile} from 'node:fs/promises';

export class SQLiteDB {
 constructor(filename) {
  this.filename=resolve(filename);mkdirSync(dirname(this.filename),{recursive:true,mode:0o700});
  this.raw=new DatabaseSync(this.filename);
  this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  this.selfHosted=true;
 }
 prepare(sql) {
  const db=this;
  const statement=(values=[])=>({
   sql,values,
   bind(...next){return statement(next);},
   async first(column){const row=db.raw.prepare(sql).get(...values);return row?(column?row[column]:{...row}):null;},
   async all(){return {results:db.raw.prepare(sql).all(...values).map(row=>({...row})),success:true};},
   async run(){const result=db.raw.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
  });
  return statement();
 }
 async batch(statements) {
  this.raw.exec('BEGIN IMMEDIATE');
  try{const results=statements.map(s=>{const result=this.raw.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(result.changes)}};});this.raw.exec('COMMIT');return results;}
  catch(error){this.raw.exec('ROLLBACK');throw error;}
 }
 async quota(owner){return Number(this.raw.prepare('SELECT quota_bytes FROM auth_accounts WHERE user_id=?').get(owner)?.quota_bytes??1073741824);}
 async snapshot(filename){return backup(this.raw,filename);}
 close(){this.raw.close();}
}

export async function migrate(DB) {
 DB.raw.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
 const directory=new URL('../drizzle/',import.meta.url);
 for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()){
  if(await DB.prepare('SELECT name FROM _local_migrations WHERE name=?').bind(name).first())continue;
  const sql=await readFile(new URL(name,directory),'utf8');
  DB.raw.exec('BEGIN IMMEDIATE');
  try{DB.raw.exec(sql);DB.raw.prepare('INSERT INTO _local_migrations(name) VALUES(?)').run(name);DB.raw.exec('COMMIT');}
  catch(error){DB.raw.exec('ROLLBACK');throw error;}
 }
 DB.raw.exec(`CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  enabled INTEGER NOT NULL DEFAULT 1, quota_bytes INTEGER NOT NULL DEFAULT 1073741824 CHECK(quota_bytes>=0),
  created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_accounts(user_id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_invites (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_accounts(user_id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_attempts (client TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_settings (name TEXT PRIMARY KEY,value TEXT NOT NULL);`);
}
