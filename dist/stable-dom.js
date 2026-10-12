// Update existing surfaces without replaying entry animations or reloading images.
const liveClasses=['is-playing','is-previewed','is-dragging','drop-ready'];
function patchNode(current,next){
 if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){current.replaceWith(next);return;}
 if(current.nodeType!==Node.ELEMENT_NODE){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 for(const attribute of [...current.attributes]){
  if(attribute.name==='open'||current.hasAttribute('data-creation-id')&&['tabindex','aria-label'].includes(attribute.name))continue;
  if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
 }
 for(const attribute of next.attributes){
  let value=attribute.value;
  if(attribute.name==='class')value=[...new Set([...value.split(/\s+/).filter(Boolean),...liveClasses.filter(name=>current.classList.contains(name))])].join(' ');
  if(current.getAttribute(attribute.name)!==value)current.setAttribute(attribute.name,value);
 }
 const oldChildren=[...current.childNodes],newChildren=[...next.childNodes];
 for(let i=0;i<Math.max(oldChildren.length,newChildren.length);i++){
  if(!newChildren[i])oldChildren[i].remove();
  else if(!oldChildren[i])current.append(newChildren[i]);
  else patchNode(oldChildren[i],newChildren[i]);
 }
}
export function patchMarkup(target,markup){
 const template=document.createElement('template');template.innerHTML=markup;
 const next=target.cloneNode(false);next.append(template.content);patchNode(target,next);
}
export function patchCreationList(target,markup){
 const template=document.createElement('template');template.innerHTML=markup;
 const existing=new Map([...target.children].map(card=>[card.dataset.creationId,card]));
 let cursor=target.firstElementChild;
 for(const next of [...template.content.children]){
  const card=existing.get(next.dataset.creationId)||next;
  if(card!==next){patchNode(card,next);existing.delete(next.dataset.creationId);}
  if(card!==cursor)target.insertBefore(card,cursor);
  cursor=card.nextElementSibling;
 }
 for(const card of existing.values())card.remove();
}
