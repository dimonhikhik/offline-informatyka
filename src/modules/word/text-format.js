export const pointSize=value=>String(value).endsWith('pt')?Number.parseFloat(value):[0,8,10,12,14,18,24,36][Number(value)];
export function formatCells(cells,command,value){
  const map={fontName:['fontFamily',value],fontSize:['fontSize',pointSize(value)+'pt'],foreColor:['color',value],hiliteColor:['backgroundColor',value],justifyLeft:['textAlign','left'],justifyCenter:['textAlign','center'],justifyRight:['textAlign','right'],justifyFull:['textAlign','justify']};
  const entry=map[command];if(!entry)return false;
  const [property,setting]=entry;
  for(const cell of cells){
    // Apply to existing runs too, so imported direct formatting does not mask the change.
    for(const node of [cell,...cell.querySelectorAll('p,div,span,font,h1,h2,h3,h4,li,b,strong,i,em,u,s')])node.style[property]=setting;
    if(command==='fontName')for(const node of cell.querySelectorAll('font[face]'))node.removeAttribute('face');
    if(command==='fontSize')for(const node of cell.querySelectorAll('font[size]'))node.removeAttribute('size');
    if(command==='foreColor')for(const node of cell.querySelectorAll('font[color]'))node.removeAttribute('color');
  }
  return true;
}
export function exactTextSize(editor,range,value){
  const size=pointSize(value);if(!Number.isFinite(size)||size<6||size>96)return;
  if(range.collapsed){const node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;const p=node.closest('p,li,td,th,h1,h2,h3,h4');if(p)p.style.fontSize=size+'pt';return;}
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT),parts=[];let node;
  while(node=walker.nextNode())if(range.intersectsNode(node)&&!node.parentElement.closest('[data-word-math],[data-word-toc]')){const start=node===range.startContainer?range.startOffset:0,end=node===range.endContainer?range.endOffset:node.length;if(end>start)parts.push({node,start,end});}
  const spans=[];
  for(const part of parts.reverse()){const r=document.createRange();r.setStart(part.node,part.start);r.setEnd(part.node,part.end);const span=document.createElement('span');span.style.fontSize=size+'pt';r.surroundContents(span);spans.unshift(span);}
  if(spans.length){const r=document.createRange();r.setStart(spans[0].firstChild,0);r.setEnd(spans.at(-1).lastChild,spans.at(-1).lastChild.length);getSelection().removeAllRanges();getSelection().addRange(r);}
}
