import { el } from '../../components/ui.js';
export function windowManager(host,tasks){
  const windows=[];let z=10,active;
  const button=(text,fn,title)=>el('button',{type:'button',onClick:fn,title,'aria-label':title},text);
  function focus(w){active=w;w.element.hidden=false;w.element.style.zIndex=++z;windows.forEach(a=>{a.element.classList.toggle('is-active',a===w);a.task.setAttribute('aria-pressed',String(a===w&&!a.element.hidden));});}
  function create(title){
    const content=el('div',{className:'win-content'}),label=el('span',{className:'win-title'},title),element=el('section',{className:'win-window',role:'region','aria-label':title}),task=button(title,()=>{if(active===w&&!element.hidden){element.hidden=true;task.setAttribute('aria-pressed','false');}else focus(w);},title);
    const w={element,content,task,lifecycle:null,setTitle(text){label.textContent=text;task.textContent=text;element.setAttribute('aria-label',text);},focus:()=>focus(w)};
    const close=async()=>{if(w.closing)return;w.closing=true;try{if(w.lifecycle?.canLeave&&!await w.lifecycle.canLeave())return;w.lifecycle?.dispose();element.remove();task.remove();windows.splice(windows.indexOf(w),1);if(windows.length)focus(windows.at(-1));}finally{w.closing=false;}};
    w.close=close;
    const titlebar=el('header',{className:'win-titlebar'},label,el('div',{},button('—',()=>{element.hidden=true;task.setAttribute('aria-pressed','false');},'Згорнути'),button('□',()=>element.classList.toggle('is-maximized'),'Розгорнути / відновити'),button('×',close,'Закрити')));
    titlebar.addEventListener('dblclick',e=>{if(!e.target.closest('button'))element.classList.toggle('is-maximized');});
    let drag;
    titlebar.addEventListener('pointerdown',e=>{if(e.target.closest('button')||element.classList.contains('is-maximized')||matchMedia('(max-width:760px)').matches)return;const rect=element.getBoundingClientRect(),area=host.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:rect.left-area.left,top:rect.top-area.top};titlebar.setPointerCapture(e.pointerId);e.preventDefault();});
    titlebar.addEventListener('pointermove',e=>{if(!drag)return;element.style.left=Math.max(0,Math.min(host.clientWidth-120,drag.left+e.clientX-drag.x))+'px';element.style.top=Math.max(0,Math.min(host.clientHeight-80,drag.top+e.clientY-drag.y))+'px';});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])titlebar.addEventListener(type,()=>drag=undefined);
    element.addEventListener('pointerdown',()=>focus(w),true);element.append(titlebar,content);const offset=windows.length%5*22;element.style.left=40+offset+'px';element.style.top=25+offset+'px';host.append(element);tasks.append(task);windows.push(w);focus(w);return w;
  }
  return {create,windows,async canLeave(){for(const w of windows)if(w.lifecycle?.canLeave&&!await w.lifecycle.canLeave())return false;return true;},dispose(){windows.forEach(w=>w.lifecycle?.dispose());}};
}
