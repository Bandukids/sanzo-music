const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function mergeState(base,local,remote,path='') {
 if(equal(local,base))return remote;
 if(equal(remote,base)||equal(local,remote))return local;
 if(base===null||base===undefined)base=Array.isArray(local)?[]:{};
 if(Array.isArray(local)&&Array.isArray(remote)&&Array.isArray(base)){
  if([...base,...local,...remote].every(v=>typeof v==='string')){
   const b=new Set(base),l=new Set(local),r=new Set(remote);
   return [...new Set([...local,...remote])].filter(v=>b.has(v)?l.has(v)&&r.has(v):l.has(v)||r.has(v));
  }
  if([...base,...local,...remote].every(v=>object(v)&&typeof v.id==='string')){
   const b=new Map(base.map(v=>[v.id,v])),l=new Map(local.map(v=>[v.id,v])),r=new Map(remote.map(v=>[v.id,v]));
   return [...new Set([...local,...remote].map(v=>v.id))].flatMap(id=>{
    if(b.has(id)&&(!l.has(id)||!r.has(id))){const present=l.get(id)||r.get(id);if(equal(present,b.get(id)))return [];throw Error('同一作品在另一页面被修改或删除，请导出未保存内容后重新加载。');}
    if(!l.has(id))return [r.get(id)];if(!r.has(id))return [l.get(id)];return [mergeState(b.get(id),l.get(id),r.get(id),path+'.'+id)];
   });
  }
 }
 if(object(local)&&object(remote)&&object(base)){
  const result={};for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const value=mergeState(base[key],local[key],remote[key],path+'.'+key);if(value!==undefined)result[key]=value;
  }return result;
 }
 throw Error('另一页面修改了相同内容，当前编辑已保留。请导出未保存内容后重新加载。');
}
