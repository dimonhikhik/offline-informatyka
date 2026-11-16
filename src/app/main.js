import { catalog,modulePage } from '../pages/catalog.js';
import { help } from '../pages/help.js';
import { practice } from '../pages/practice.js';
import { connectionPage } from '../pages/connection.js';
import { filesPage } from '../pages/files.js';
import { el,heading,notify } from '../components/ui.js';
import { modules } from '../core/module-registry/index.js';
import * as filesystem from '../core/filesystem/index.js';
import { hasSiteText,loadContent,refreshSiteTexts } from '../core/content/index.js';
import { loadPracticeMaterials } from '../practice/catalog.js';
import { isHostedSite } from '../core/platform.js';
const root=document.querySelector('#main');
const hosted=isHostedSite();
const teacherHost=!hosted&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
function refreshShell(){
  refreshSiteTexts();
  for(const node of document.querySelectorAll('[data-custom-site-text]')){
    node.hidden=!hasSiteText(node.dataset.siteText)||!node.textContent.trim();
  }
}
const contentReady=hosted?Promise.resolve().then(refreshShell):Promise.all([
  loadContent().catch(()=>notify('Матеріали вчителя недоступні. Показано стандартні.')),
  loadPracticeMaterials()
]).then(refreshShell);
window.addEventListener('site-content-changed',refreshShell);
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();root.focus();});
if(teacherHost){
  document.querySelector('.site-tools').append(el('a',{href:'#admin',className:'button site-admin-link','data-nav':'admin','aria-label':'Панель учителя'},
    el('span',{className:'site-icon site-icon-settings','aria-hidden':'true'},'⚙'),el('span',{className:'site-tool-label'},'Панель учителя')));
}
const recentWorkKey='offline-informatyka.recent-work';
history.scrollRestoration='manual';
let navigation=0,activeEditor,activeWork,currentHash=location.hash||'#catalog',recentWork;
try{
  const work=JSON.parse(localStorage.getItem(recentWorkKey));
  if(work&&modules.some(module=>module.id===work.moduleId&&module.entry)
    &&(work.moduleId==='windows'?work.fileId===undefined||/^(?:[4-9]:)?[-a-z0-9]{1,80}$/.test(work.fileId):/^[a-f0-9]{32}$/.test(work.fileId))){
    recentWork=work;
  }
}catch{/* The open tab can still keep its latest saved work in memory. */}

function rememberWork(work){
  recentWork=work;
  try{
    if(work)localStorage.setItem(recentWorkKey,JSON.stringify(work));
    else localStorage.removeItem(recentWorkKey);
  }catch{/* File contents are stored separately in IndexedDB. */}
}

function rememberPosition(){
  if(!activeWork||recentWork?.moduleId!==activeWork.moduleId||recentWork.fileId!==activeWork.fileId)return;
  const position=activeEditor?.getResumePosition?.(recentWork.fileId);
  if(position!==undefined)rememberWork({...recentWork,position});
}

async function latestSavedWork(){
  const work=recentWork;
  if(!work||work.moduleId==='windows')return work;
  try{
    const file=await filesystem.getFile(work.fileId);
    if(!file){
      if(recentWork===work)rememberWork(undefined);
      return;
    }
    return {...work,name:file.name};
  }catch{/* Retry on the next visit to the catalog if storage was unavailable. */}
}

async function route(){
  const sequence=++navigation,requestedHash=location.hash||'#catalog';
  await contentReady;
  if(sequence!==navigation||activeEditor&&requestedHash===currentHash)return;
  if(activeEditor?.canLeave){
    if(root.contains(document.activeElement))document.activeElement.blur();
    const allowed=await activeEditor.canLeave();
    if(sequence!==navigation)return;
    if(!allowed){history.replaceState(null,'',currentHash);return;}
  }
  rememberPosition();
  activeWork=undefined;activeEditor?.dispose();activeEditor=undefined;currentHash=requestedHash;
  const [page,id,fileId]=requestedHash.slice(1).split('/');
  root.replaceChildren();
  document.querySelectorAll('[data-nav]').forEach(link=>{
    const active=link.dataset.nav===(['module','editor'].includes(page)?'catalog':page);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  if(page==='catalog')catalog(root,latestSavedWork());
  else if(page==='module')modulePage(root,id);
  else if(page==='help')help(root);
  else if(page==='practice')practice(root,id,fileId);
  else if(page==='connect')connectionPage(root);
  else if(page==='admin'){
    if(!teacherHost){
      root.append(heading('','Панель учителя','Для публікації завдань у класі відкрий панель на комп’ютері, де запущено локальний сервер.'),
        el('a',{href:'#practice',className:'button primary'},'Практичні роботи'));
      return;
    }
    root.append(el('p',{role:'status'},'Відкриваємо панель учителя…'));
    try{const {mount}=await import('../pages/admin.js');if(sequence!==navigation)return;root.replaceChildren();activeEditor=mount(root);}
    catch(error){if(sequence===navigation)root.replaceChildren(heading('','Не вдалося відкрити панель учителя',error.message));}
  }
  else if(page==='editor'){
    const module=modules.find(item=>item.id===id);
    if(!module?.entry)modulePage(root,id);
    else{
      root.append(el('p',{role:'status'},'Відкриваємо редактор…'));
      try{
        const editor=await module.entry();
        if(sequence!==navigation)return;
        const work={moduleId:id};
        const resume=recentWork?.moduleId===id&&recentWork.fileId===fileId?recentWork:undefined;
        activeWork=work;
        root.replaceChildren();
        activeEditor=editor.mount(root,{filesystem,notify,fileId,resume,rememberWork(record,metadata={}){
          if(activeWork!==work||!record||(id!=='windows'&&!record.id))return;
          work.fileId=record.id;
          const previous=recentWork?.moduleId===id&&recentWork.fileId===record.id?recentWork:undefined;
          rememberWork({
            moduleId:id,fileId:record.id,
            name:id==='windows'?record.name:undefined,
            practiceFileId:metadata.practiceFileId??previous?.practiceFileId,
            position:metadata.position??activeEditor?.getResumePosition?.(record.id)??previous?.position
          });
        }});
      }catch{if(sequence===navigation)root.replaceChildren(heading('','Не вдалося відкрити редактор','Перевір сервер і онови сторінку.'));}
    }
  }
  else if(page==='files')filesPage(root);
  else root.append(heading('','Сторінку не знайдено'),el('a',{href:'#catalog',className:'button primary'},'До каталогу'));
  if(sequence===navigation){window.scrollTo(0,0);root.focus({preventScroll:true});}
}
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',rememberPosition);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')rememberPosition();
});
route();
