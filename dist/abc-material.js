// Shared by the upload UI and Worker: keep text validation identical.
export const ABC_FILE_LIMIT=200000;
export function readABCText(bytes){
 if(bytes.byteLength>ABC_FILE_LIMIT)throw Error('ABC 文件不能超过 200 KB。');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('请使用 UTF-8 编码的 ABC 乐谱。');}
 text=text.replace(/^\uFEFF/,'').trim();
 const fenced=text.match(/```(?:abc|text)?\s*\n([\s\S]*?)```/i);if(fenced)text=fenced[1].trim();
 if(!text||text.length>50000||text.includes('\0')||!/^K:\s*\S+/m.test(text))throw Error('请选择有效的 ABC 乐谱，最多 50000 字符，需包含 K: 调号。');
 return text;
}
