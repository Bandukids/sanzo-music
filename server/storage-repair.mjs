export async function repairStorage(env){
 await env.BUCKET.check();
 const pending=(await env.DB.prepare("SELECT owner,id,object_key FROM assets WHERE status='uploading'").all()).results;
 for(const row of pending){await env.BUCKET.delete(row.object_key);await env.DB.prepare("DELETE FROM assets WHERE owner=? AND id=? AND status='uploading'").bind(row.owner,row.id).run();}
 await env.DB.prepare("UPDATE users SET bytes=COALESCE((SELECT SUM(bytes) FROM assets WHERE assets.owner=users.id),0)").run();
 await env.DB.prepare('UPDATE generations SET lease_until=0').run();await env.DB.prepare('UPDATE covers SET lease_until=0').run();
 await env.DB.prepare("UPDATE generations SET status='failed',error='服务已重启，生成尚未提交，请手动重试。' WHERE status='planning' AND task_id IS NULL").run();
 await env.DB.prepare("UPDATE generations SET status='unknown',error='服务重启前的提交状态待核对，请检查 RunningHub 任务记录；不会自动重复提交。' WHERE status='submitting' AND task_id IS NULL").run();
 await env.DB.prepare("UPDATE covers SET status='fallback',error='服务重启，封面提交状态待核对；已使用备用封面，不会自动重复提交。' WHERE status IN ('planning','submitting') AND task_id IS NULL").run();
 return {interruptedUploads:pending.length};
}
