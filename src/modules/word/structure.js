import { paragraphStyleId,paragraphStyles } from './styles.js';

export const breakLabels={page:'Розрив сторінки','section-next':'Розрив розділу — з нової сторінки','section-continuous':'Розрив розділу — без нової сторінки'};
export function breakHTML(kind){if(!Object.hasOwn(breakLabels,kind))throw new Error('Невідомий розрив.');return `<div data-word-break="${kind}" contenteditable="false" tabindex="0">${breakLabels[kind]}</div>`;}
export function updateContents(root){
  const headings=[...root.querySelectorAll('h1,h2,h3,li[data-word-style]')]
    .map(node=>({node,level:paragraphStyles[paragraphStyleId(node)].level}))
    .filter(({node,level})=>level<=3&&!node.closest('[data-word-toc]'));
  headings.forEach(({node},i)=>node.id='word-heading-'+(i+1));
  for(const toc of root.querySelectorAll('[data-word-toc]')){
    toc.replaceChildren();toc.contentEditable='false';const title=document.createElement('p');title.textContent='Зміст';title.style.fontWeight='bold';toc.append(title);
    if(!headings.length){const p=document.createElement('p');p.textContent='Застосуй стилі «Заголовок 1–3», потім натисни «Оновити зміст».';toc.append(p);}
    for(const {node,level} of headings){
      const p=document.createElement('p'),a=document.createElement('a'),label=node.cloneNode(true);
      for(const list of label.querySelectorAll('ol,ul'))list.remove();
      p.style.marginLeft=((level-1)*18)+'px';a.href='#'+node.id;a.textContent=label.textContent||'Без назви';p.append(a);toc.append(p);
    }
  }
  return headings.length;
}
export const structureCSS='[data-word-break]{border-top:1px dashed #94a3b8;text-align:center;font:11px Arial,sans-serif;color:#64748b;padding:8px 0;margin:12px 0;cursor:pointer}[data-word-toc]{border:1px solid #cbd5e1;padding:14px;margin:16px 0}[data-word-toc] p{margin:4px 0}[data-word-toc] a{color:#2563eb;text-decoration:none}';
