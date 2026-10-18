import {basename} from 'node:path';
const safe=value=>String(value??'').replace(/https?:\/\/[^\s<>"']+/gi,'[地址已隐藏]').replace(/\b[a-f0-9]{32,}\b/gi,'[已隐藏]').replace(/((?:api[_-]?key|password|token|authorization)\s*[=:]\s*)[^\s,;]+/gi,'$1[已隐藏]').slice(0,600);
const numeric=value=>value!==null&&value!==undefined&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
export function backupStatePayload(schedule,latest,now=new Date()){
 const state=schedule?{status:['success','failed','deferred'].includes(schedule.status)?schedule.status:'unknown',lastAttempt:time(schedule.lastAttempt),lastSuccess:time(schedule.lastSuccess),finishedAt:time(schedule.finishedAt),nextAttemptAt:time(schedule.nextAttemptAt),consecutiveFailures:numeric(schedule.consecutiveFailures),files:numeric(schedule.files),bytes:numeric(schedule.bytes),target:schedule.target?basename(schedule.target):null,lastError:schedule.lastError?safe(schedule.lastError):null,retention:schedule.retention?.warning?{warning:safe(schedule.retention.warning)}:null}:null;
 const snapshot=latest?{createdAt:time(latest.createdAt),files:numeric(latest.files),bytes:numeric(latest.bytes),target:latest.target?basename(latest.target):null}:null;
 return {version:1,publishedAt:now.toISOString(),schedule:state,latest:snapshot};
}
