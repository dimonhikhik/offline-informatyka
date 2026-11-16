// Keep selected list items as lists, splitting only the affected list runs.
export function wrapColumnSelection(editor,targets,wrapper){
  const items=[...new Set(targets.map(p=>p.closest('li')||p))];
  const roots=items.filter(p=>!items.some(other=>other!==p&&other.contains(p)));
  if(!roots.length)throw new Error('Постав курсор в абзац або виділи текст перед відкриттям стовпців.');
  for(const p of roots){
    if(!editor.contains(p)||!['P','DIV','H1','H2','H3','H4','BLOCKQUOTE','LI'].includes(p.tagName)||p.closest('td,th,[data-word-toc],[data-word-math],[data-word-columns]')||p.hasAttribute('data-word-page')||p.hasAttribute('data-word-break'))throw new Error('Стовпці доступні для тексту та списків поза таблицею і змістом.');
  }
  const host=p=>{const parent=p.tagName==='LI'?p.parentElement.parentElement:p.parentElement;return parent.hasAttribute('data-word-page')?editor:parent;};
  if(roots.some(p=>host(p)!==host(roots[0])))throw new Error('Виділи сусідні абзаци або пункти одного рівня списку.');
  const chosen=new Set(roots),units=new Map(),lists=new Set(roots.filter(p=>p.tagName==='LI').map(p=>p.parentElement));
  for(const list of lists){
    const children=[...list.children],start=Number(list.getAttribute('start'))||1;let run=null,previous=null;
    children.forEach((item,index)=>{
      const selected=chosen.has(item);
      if(!run||selected!==previous){run=list.cloneNode(false);run.removeAttribute('id');if(list.tagName==='OL')run.setAttribute('start',String(start+index));list.before(run);previous=selected;}
      run.append(item);if(selected)units.set(item,run);
    });list.remove();
  }
  const content=[...new Set(roots.map(p=>units.get(p)||p))];content[0].before(wrapper);wrapper.append(...content);
}
