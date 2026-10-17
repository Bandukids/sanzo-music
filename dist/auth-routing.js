export function safeReturnPath(value, fallback='/') {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return fallback;
 try{const url=new URL(value,'https://sanzo.invalid');if(url.origin!=='https://sanzo.invalid'||/^\/login(?:\/|$)/.test(url.pathname))return fallback;return url.pathname+url.search+url.hash;}catch{return fallback;}
}
export function loginURL(returnTo='/'){return '/login/?next='+encodeURIComponent(safeReturnPath(returnTo));}
