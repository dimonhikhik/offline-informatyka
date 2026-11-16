const selector='p,h1,h2,h3,h4,li,blockquote,div';
function blockFor(editor,node,includeCells){
  let element=node.nodeType===1?node:node.parentElement;
  if(element?.closest('[data-word-toc]'))return null;
  for(let p=element;p&&p!==editor;p=p.parentElement){
    if(p.hasAttribute('data-word-page')||p.hasAttribute('data-word-columns'))return null;
    if(p.matches(selector)&&!p.hasAttribute('data-word-break'))return p;
    if(includeCells&&p.matches('td,th')&&!p.querySelector(selector))return p;
  }
  return null;
}
// Inspect selected content, not its ancestors: a page containing an OL is not a paragraph.
export function selectedBlocks(editor,range,{includeCells=false}={}){
  const common=range.commonAncestorContainer;
  if(!editor.contains(common))return [];
  if(range.collapsed||common.nodeType===3){const block=blockFor(editor,common,includeCells);return block?[block]:[];}
  const start=range.cloneRange(),end=range.cloneRange();start.collapse(true);end.collapse(false);
  const result=new Set(),walker=document.createTreeWalker(common,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let node;while(node=walker.nextNode()){
    if(node.nodeType!==3&&node.tagName!=='BR'&&!(node.matches?.(selector)&&!node.childNodes.length))continue;
    if(node.nodeType===3&&!node.textContent.length)continue;
    const span=document.createRange();span.selectNode(node);const a=span.cloneRange(),b=span.cloneRange();a.collapse(true);b.collapse(false);
    // Use text offsets for endpoint paragraphs; selecting up to offset 0 excludes the next item.
    if(node.nodeType===3){a.setStart(node,0);a.collapse(true);b.setStart(node,node.length);b.collapse(true);}
    if(end.compareBoundaryPoints(Range.START_TO_START,a)>0&&start.compareBoundaryPoints(Range.START_TO_START,b)<0){const block=blockFor(editor,node,includeCells);if(block)result.add(block);}
  }
  return [...result];
}
export function shiftBlocks(blocks,delta){
  const items=[...new Set(blocks.map(p=>p.closest('li')||p))];
  const roots=items.filter(p=>!items.some(other=>other!==p&&other.contains(p)));
  const listItems=roots.filter(p=>p.tagName==='LI');
  // Reverse outdent order so consecutive items retain their document order.
  for(const item of delta<0?[...listItems].reverse():listItems){
    const list=item.parentElement;if(!list?.matches('ol,ul'))continue;
    if(delta>0){const previous=item.previousElementSibling;if(previous?.tagName!=='LI')continue;
      let nested=[...previous.children].find(n=>n.tagName===list.tagName);
      if(!nested){nested=document.createElement(list.tagName.toLowerCase());previous.append(nested);}nested.append(item);
    }else{
      const parent=list.parentElement;if(parent?.tagName!=='LI'||!parent.parentElement?.matches('ol,ul'))continue;
      parent.after(item);
    }
    if(!list.children.length)list.remove();
  }
  for(const p of roots.filter(p=>p.tagName!=='LI')){
    if(p.hasAttribute('data-word-list-level'))p.setAttribute('data-word-list-level',String(Math.max(1,Math.min(3,Number(p.getAttribute('data-word-list-level'))+delta))));
    else p.style.marginLeft=Math.max(0,Math.min(240,(parseFloat(p.style.marginLeft)||0)+delta*24))+'px';
  }
}
