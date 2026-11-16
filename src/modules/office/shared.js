import { el,download } from '../../components/ui.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { guideFor } from '../../practice/guide.js';
export { el,download };
export const button=(label,action,attrs={})=>el('button',{type:'button',onClick:action,...attrs},label);
export const cleanName=value=>String(value||'Без назви').replace(/[\\/\x00-\x1f]/g,' ').trim().slice(0,100)||'Без назви';
export const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||min));
export const color=(v,fallback='#ffffff')=>/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
const libraries=new Map();
export function library(file,global){
  if(window[global])return Promise.resolve(window[global]);
  if(!libraries.has(file))libraries.set(file,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../../vendor/'+file,import.meta.url).href;script.onload=()=>window[global]?resolve(window[global]):reject(new Error('Бібліотека недоступна'));script.onerror=()=>{libraries.delete(file);script.remove();reject(new Error('Не вдалося завантажити локальну бібліотеку'));};document.head.append(script);}));
  return libraries.get(file);
}
export function office(root,context,config){
  let state=config.blank(),record,disposed=false,busy=false,loading=Promise.resolve(),render=()=>{},history=[],future=[];
  let view;
  const host=el('section',{className:'office-editor '+config.id}),body=el('div',{className:'office-workspace'}),tools=el('div',{className:'office-tools'}),status=el('span',{className:'office-status','aria-live':'polite'},'Автозбереження');
  const name=el('input',{value:state.name,maxlength:100,'aria-label':'Назва роботи',onChange:commitName});
  function commitName(){
    const next=cleanName(name.value);
    if(next===state.name){name.value=next;return;}
    change(()=>{state.name=next;name.value=next;},false);
  }
  function prepareForSave(){if(!busy&&!disposed){commitName();view?.commitPending?.();}}
  function rememberCurrent(){if(record&&!disposed)context.rememberWork?.(record,{position:view?.getPosition()});}
  const autosave=createAutosave(async()=>{
    record=await context.filesystem.saveFile({...record,name:cleanName(state.name)+config.ext,moduleId:config.id,blob:new Blob([JSON.stringify(state)],{type:'application/json'})});
    rememberCurrent();
  },(phase,error)=>{if(!disposed)status.textContent={dirty:'Є зміни…',saving:'Зберігаємо…',saved:'Збережено в «Мої файли»'}[phase]||'Не збережено: '+storageError(error);},undefined,prepareForSave);
  function change(action,redraw=true){if(busy||disposed)return;history.push(JSON.stringify(state));while(history.length>25||history.length>1&&history.reduce((n,s)=>n+s.length,0)>24000000)history.shift();future=[];action();autosave.change();if(redraw)render();}
  function travel(from,to){if(!from.length||busy)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());name.value=state.name;autosave.change();render();}
  async function run(action){if(busy||disposed)return;prepareForSave();busy=true;host.inert=true;try{await action();}catch(error){context.notify(error.message||storageError(error));}finally{busy=false;host.inert=false;}}
  const input=el('input',{type:'file',hidden:true,accept:config.accept,onChange:e=>{const file=e.target.files[0];e.target.value='';if(file)run(async()=>{await autosave.flush();const next=await config.read(file);if(disposed)return;state=next;record=undefined;history=[];future=[];name.value=state.name;autosave.change();render();});}});
  const menu=el('details',{className:'office-file'},el('summary',{},'Файл'),el('div',{},button('Зберегти',()=>run(async()=>{autosave.change();await autosave.flush();})),button('Відкрити…',()=>input.click()),button('Завантажити проєкт',()=>download(new Blob([JSON.stringify(state)],{type:'application/json'}),cleanName(state.name)+config.ext)),button('Новий',()=>{if(confirm('Створити нову роботу? Поточна залишиться в «Мої файли».'))run(async()=>{autosave.change();await autosave.flush();state=config.blank();record=undefined;history=[];future=[];name.value=state.name;render();});}),input));
  menu.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});
  const top=el('header',{className:'office-top'},el('a',{href:'#catalog',className:'button','aria-label':'До каталогу'},'←'),el('strong',{},config.label),name,button('↶',()=>travel(history,future),{title:'Скасувати','aria-label':'Скасувати'}),button('↷',()=>travel(future,history),{title:'Повторити','aria-label':'Повторити'}),menu);
  host.append(top,tools,body,status);root.append(host);document.body.classList.add('office-focus-mode');
  const assignment=guideFor(context.fileId);if(assignment)top.append(assignment);
  tools.addEventListener('toggle',e=>{if(e.target.tagName!=='DETAILS'||!e.target.open)return;for(const detail of tools.querySelectorAll('details'))if(detail!==e.target)detail.open=false;if(matchMedia('(max-width:760px)').matches)body.querySelector('.slide-properties')?.removeAttribute('open');},true);
  const viewport=()=>host.style.setProperty('--office-height',`${window.visualViewport?.height||innerHeight}px`);viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
  const before=e=>{prepareForSave();if(autosave.dirty()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);
  function key(event){
    if(event.defaultPrevented||event.altKey||!(event.ctrlKey||event.metaKey))return;
    const action=event.key.toLowerCase();
    if(action==='s'){
      event.preventDefault();
      run(async()=>{autosave.change();await autosave.flush();});
      return;
    }
    if(action!=='z'&&action!=='y')return;
    const target=event.target;
    if(!target?.closest||(target!==root&&!host.contains(target))||target.closest('input, textarea, select, [contenteditable], dialog'))return;
    event.preventDefault();
    if(action==='y'||event.shiftKey)travel(future,history);
    else travel(history,future);
  }
  window.addEventListener('keydown',key);
  if(context.fileId){
    busy=true;host.inert=true;
    loading=(async()=>{
      try{
        const file=await context.filesystem.getFile(context.fileId);
        if(!file)throw new Error('Файл не знайдено');
        const next=await config.read(file.blob,file.name);
        if(disposed)return;
        state=next;record=file.name.endsWith(config.ext)?file:undefined;name.value=state.name;
        if(record&&context.resume?.position)view?.restorePosition(context.resume.position);
        render();rememberCurrent();
      }catch(error){if(!disposed)context.notify(error.message);}
      finally{busy=false;host.inert=false;}
    })();
  }
  return {get state(){return state;},host,body,tools,menu,change,run,notify:context.notify,
    setRender(fn,viewControls){render=fn;view=viewControls;render();},
    lifecycle:{
      getResumePosition(fileId){return record&&record.id===fileId?view?.getPosition():undefined;},
      async canLeave(){
        await loading;
        if(busy)return false;
        try{prepareForSave();await autosave.flush();return true;}
        catch{return confirm('Не вдалося зберегти. Вийти без останніх змін?');}
      },
      dispose(){disposed=true;autosave.dispose();document.body.classList.remove('office-focus-mode');window.removeEventListener('beforeunload',before);window.removeEventListener('keydown',key);window.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('resize',viewport);}
    }};
}
