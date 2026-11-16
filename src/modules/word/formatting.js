// Semantic attributes are shared by editing, saving, printing and DOCX export.
export function columnSettings(node){
  const count=Number(node.getAttribute('data-word-columns')),width=Number(node.getAttribute('data-column-width')),gap=Number(node.getAttribute('data-column-gap'));
  return {count:[2,3].includes(count)?count:2,width:Number.isFinite(width)&&width>=3&&width<=12?width:7,gap:Number.isFinite(gap)&&gap>=0&&gap<=3?gap:1};
}
export function styleColumns(node){const {count,width,gap}=columnSettings(node);node.style.columnCount=String(count);node.style.columnGap=gap+'cm';node.style.width=(count*width+(count-1)*gap)+'cm';node.style.maxWidth='100%';node.style.columnFill='balance';}
export function updateListLabels(root){
  const counts=[0,0,0];
  for(const p of root.querySelectorAll('[data-word-list-level]')){
    const level=Number(p.getAttribute('data-word-list-level'));if(![1,2,3].includes(level))continue;
    counts[level-1]++;for(let i=level;i<3;i++)counts[i]=0;
    p.setAttribute('data-word-list-label',counts[level-1]+(level===2?')':'.'));
  }
}
export const formattingCSS='[data-word-columns]{column-fill:balance;margin:12pt 0}[data-word-columns]>p{orphans:2;widows:2}[data-word-list-level]{position:relative;padding-left:1.5em!important;text-indent:0!important}[data-word-list-level="1"]{margin-left:0!important}[data-word-list-level="2"]{margin-left:1.5em!important}[data-word-list-level="3"]{margin-left:3em!important}[data-word-list-level]::before{content:attr(data-word-list-label);position:absolute;left:0;top:0;color:inherit}';
