import { el } from './ui.js';
export function contextMenu(owner){
  let menu,origin;
  function close(restore=false){menu?.remove();menu=undefined;if(restore)origin?.focus?.({preventScroll:true});}
  function open(items,x,y){
    close();origin=document.activeElement;
    menu=el('div',{className:'desktop-context',role:'menu','aria-label':'Контекстне меню'});
    for(const item of items){if(!item){menu.append(el('hr'));continue;}menu.append(el('button',{type:'button',role:'menuitem',disabled:!!item.disabled,onClick:()=>{close();item.action();}},item.label));}
    owner.append(menu);
    const rect=menu.getBoundingClientRect(),width=window.innerWidth,height=window.visualViewport?.height||window.innerHeight;
    menu.style.left=Math.max(6,Math.min(x,width-rect.width-6))+'px';menu.style.top=Math.max(6,Math.min(y,height-rect.height-6))+'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close(true);}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}});
  }
  const outside=e=>{if(menu&&!menu.contains(e.target))close();};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);
  const bindings=[];
  function bind(element,getItems){
    let timer,point,held=false;
    const clear=()=>clearTimeout(timer);
    const show=e=>{const items=getItems(e);if(!items?.length)return;e.preventDefault();e.stopPropagation();const rect=element.getBoundingClientRect();open(items,e.clientX||rect.left+20,e.clientY||rect.top+20);};
    const down=e=>{held=false;if(e.pointerType!=='touch')return;point=[e.clientX,e.clientY];timer=setTimeout(()=>{held=true;show(e);},600);};
    const move=e=>{if(point&&Math.hypot(e.clientX-point[0],e.clientY-point[1])>10)clear();};
    const click=e=>{if(held){e.preventDefault();e.stopImmediatePropagation();held=false;}};
    const key=e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')show(e);};
    const events=[['contextmenu',show],['pointerdown',down],['pointermove',move],['pointerup',clear],['pointercancel',clear],['click',click,true],['keydown',key]];
    for(const [type,fn,capture] of events)element.addEventListener(type,fn,capture);
    bindings.push(()=>{clear();for(const [type,fn,capture] of events)element.removeEventListener(type,fn,capture);});
  }
  return {open,close,bind,dispose(){close();bindings.forEach(fn=>fn());document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);}};
}
