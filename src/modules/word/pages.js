// Pages are a view of the document; their wrappers never enter saved HTML.
export function paginate(editor,getDocument,onLayout,beforePassiveSelection,getRememberedRange){
  let frame=0,disposed=false,composing=false;
  const pageNodes=()=>[...editor.children].filter(n=>n.hasAttribute('data-word-page'));
  function html(){const copy=editor.cloneNode(true);for(const page of copy.querySelectorAll('[data-word-page]'))page.replaceWith(...page.childNodes);return copy.innerHTML;}
  function layout(){
    frame=0;if(disposed||composing||!editor.isConnected||!editor.clientWidth)return;
    const focused=document.activeElement;
    const selection=getSelection(),saved=selection?.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode)?{a:selection.anchorNode,ao:selection.anchorOffset,f:selection.focusNode,fo:selection.focusOffset}:null;
    const remembered=getRememberedRange?.();
    const endpoints=remembered&&[remembered.startContainer,remembered.startOffset,remembered.endContainer,remembered.endOffset];
    const unwrap=n=>n.nodeType===1&&n.hasAttribute('data-word-page')?[...n.childNodes].flatMap(unwrap):[n];
    const nodes=[...editor.childNodes].flatMap(unwrap);
    const old=pageNodes();
    const doc=getDocument(),width=editor.clientWidth,ratio=doc.orientation==='landscape'?210/297:297/210;
    const margin=width*doc.margin/(doc.orientation==='landscape'?297:210),height=width*ratio;
    const scale=editor.getBoundingClientRect().width/width||1;
    editor.style.setProperty('--sheet-height',height+'px');editor.style.setProperty('--sheet-margin',margin+'px');
    let page,count=0,used=0;
    function next(){page=document.createElement('div');page.setAttribute('data-word-page',String(++count));page.setAttribute('data-header',doc.header);page.setAttribute('data-footer',[doc.footer,doc.pageNumbers?String(count):''].filter(Boolean).join(' · '));page.setAttribute('aria-label','Сторінка '+count);editor.append(page);used=0;}
    next();
    for(const node of nodes){
      page.append(node);
      const r=document.createRange();r.selectNode(node);const rect=r.getBoundingClientRect();
      if(used&&rect.bottom>page.getBoundingClientRect().top+(height-margin)*scale){next();page.append(node);}
      used++;
      if(node.nodeType===1&&['page','section-next'].includes(node.getAttribute('data-word-break')))next();
    }
    for(const p of old)p.remove();
    if(!page.childNodes.length){const p=document.createElement('p');p.innerHTML='<br>';page.append(p);}
    if(saved&&editor.contains(saved.a)&&editor.contains(saved.f)){
      if(!editor.contains(focused))beforePassiveSelection?.();
      try{selection.setBaseAndExtent(saved.a,saved.ao,saved.f,saved.fo);}catch{/* A browser edit may have removed an endpoint. */}
    }
    if(focused?.isConnected&&focused!==document.body&&!editor.contains(focused)&&document.activeElement!==focused)focused.focus({preventScroll:true});
    let restored=null;
    if(endpoints&&endpoints[0]!==editor&&endpoints[2]!==editor&&editor.contains(endpoints[0])&&editor.contains(endpoints[2])){
      restored=document.createRange();
      restored.setStart(endpoints[0],endpoints[1]);
      restored.setEnd(endpoints[2],endpoints[3]);
    }
    onLayout?.(count,restored);
  }
  function schedule(){if(!frame&&!disposed&&!composing)frame=requestAnimationFrame(layout);}
  let observedWidth=-1;const observer=new ResizeObserver(()=>{const width=editor.clientWidth;if(width!==observedWidth){observedWidth=width;schedule();}});observer.observe(editor);
  const start=()=>{composing=true;},end=()=>{composing=false;schedule();};
  editor.addEventListener('compositionstart',start);editor.addEventListener('compositionend',end);editor.addEventListener('load',schedule,true);
  document.fonts?.ready.then(schedule);
  return {html,schedule,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();editor.removeEventListener('compositionstart',start);editor.removeEventListener('compositionend',end);editor.removeEventListener('load',schedule,true);}};
}
