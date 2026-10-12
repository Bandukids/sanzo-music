// Keep saved artwork identifiers compatible with existing albums and drafts.
export function isSavedArtwork(file){
 return typeof file==='string'&&(['liquid-glass.png','liquid-glass.webp','forest.jpg','coast.jpg','mountains.jpg'].includes(file)||/^covers\/(electronic|folk|lofi|cinematic|jazz|rock)\.webp$/.test(file)||/^\/api\/assets\/cover-[a-f0-9-]{36}$/.test(file)||/^\/api\/releases\/[a-f0-9-]{36}\/cover$/.test(file));
}
export function artworkURL(file) {
  if(typeof file==='string'&&(/^\/api\/assets\/cover-[a-f0-9-]{36}$/.test(file)||/^\/api\/releases\/[a-f0-9-]{36}\/cover$/.test(file)))return file;
  return '/assets/' + (file === 'liquid-glass.png' ? 'liquid-glass.webp' : file);
}
