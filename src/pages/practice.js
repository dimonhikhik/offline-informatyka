import { el,notify } from '../components/ui.js';
import { tasks,loadTaskProgress,saveTaskProgress } from '../practice/catalog.js';
import { instructionButton } from '../practice/guide.js';
import { getFile,saveFile } from '../core/filesystem/index.js';
import { blank,projectBlob } from '../modules/word/model.js';
import { importDocx } from '../modules/word/docx-import.js';
import { siteText } from '../core/content/index.js';
import { editorTypes,textFields } from '../core/content/schema.js';
import { artStyle,menuArt } from './catalog-art.js';

const grades=[4,5,6,7,8,9];
const practicePath=(grade,id)=>`#practice/${grade}${id?'/'+id:''}`;
const tasksFor=grade=>tasks.filter(task=>task.grade===Number(grade));
const hasProgress=task=>loadTaskProgress(task).files.some(Boolean);
const preferredArt={4:'browser',5:'windows',6:'word',9:'word'};

function artwork(id){
  const key=Object.hasOwn(menuArt,id)?id:'files';
  return el('span',{className:'practice-art','aria-hidden':'true'},
    el('span',{className:'practice-art-image',style:artStyle(key)}));
}

function titleBlock(title,back=null){
  return el('header',{className:'practice-head'},back,el('h1',{},title));
}

function backLink(href,label){
  return el('a',{className:'practice-back',href},el('span',{'aria-hidden':'true'},'←'),label);
}

function taskCount(count){
  if(!count)return 'Поки без завдань';
  const remainder=count%100,last=count%10;
  const label=(remainder<11||remainder>14)&&last>=1&&last<=4?'завдання':'завдань';
  return `${count} ${label}`;
}

function gradeGallery(){
  return el('nav',{className:'practice-grade-grid','aria-label':'Вибір класу'},...grades.map(grade=>{
    const available=tasksFor(grade);
    const art=available.find(task=>task.moduleId===preferredArt[grade])?.moduleId||available[0]?.moduleId;
    return el('a',{href:practicePath(grade),className:`practice-grade-card${available.length?'':' is-empty'}`},
      el('div',{className:'practice-grade-content'},
        el('span',{className:'practice-grade-number'},el('strong',{},String(grade)),el('span',{},'клас')),
        el('span',{className:'practice-meta'},taskCount(available.length))),
      artwork(art),el('span',{className:'practice-card-arrow','aria-hidden':'true'},'↗'));
  }));
}

function gradeNavigation(grade){
  return el('nav',{className:'practice-grade-tabs','aria-label':'Класи'},...grades.map(n=>
    el('a',{className:'practice-grade-tab',href:practicePath(n),'aria-label':`${n} клас`,'aria-current':n===Number(grade)?'page':null},String(n))));
}

function taskCard(task){
  const info=[task.duration,hasProgress(task)?'Розпочато':null].filter(Boolean).join(' · ');
  return el('a',{href:practicePath(task.grade,task.id),className:'practice-task-card'},
    artwork(task.moduleId),
    el('div',{className:'practice-task-card-content'},
      el('h2',{},task.title),
      task.subtitle?el('p',{className:'practice-brief'},task.subtitle):null,
      info?el('span',{className:'practice-meta'},info):null),
    el('span',{className:'practice-card-arrow','aria-hidden':'true'},'→'));
}

async function createTaskFile(task,part,index){
  const moduleId=task.moduleId;
  if(moduleId==='excel'||moduleId==='powerpoint'){
    const model=moduleId==='excel'?await import('../modules/excel/model.js'):await import('../modules/powerpoint/model.js');
    const project=model.blank();
    project.name=part.name;
    const extension=moduleId==='excel'?'.sheets.json':'.slides.json';
    return saveFile({name:part.name+extension,blob:new Blob([JSON.stringify(project)],{type:'application/json'}),moduleId});
  }
  if(moduleId==='browser'){
    const {blankBrowser,browserBlob}=await import('../modules/browser/model.js');
    const project=blankBrowser();
    project.name=part.name;
    return saveFile({name:part.name+'.browser.json',blob:browserBlob(project),moduleId});
  }
  if(moduleId==='python'){
    const {blankProject,projectBlob,projectExtension}=await import('../modules/python/project.js');
    return saveFile({name:part.name+projectExtension,blob:projectBlob(blankProject({code:''})),moduleId});
  }
  if(moduleId==='vector'){
    const [{blank},{serialize}]=await Promise.all([import('../modules/vector/model.js'),import('../modules/vector/svg.js')]);
    return saveFile({name:part.name+'.svg',blob:serialize(blank()),moduleId});
  }
  if(moduleId==='raster'){
    const {blankRasterProject}=await import('../modules/raster/index.js');
    return saveFile({name:part.name+'.raster.json',blob:await blankRasterProject(),moduleId});
  }
  let doc=blank();
  if(index===0&&task.asset){
    const response=await fetch(task.asset);
    if(!response.ok)throw Error('Заготовка недоступна. Перевір локальний сервер.');
    doc=await importDocx(await response.blob());
  }else if(index===0&&task.starterWord)doc.html=task.starterWord();
  return saveFile({name:part.name+'.word.json',blob:projectBlob(doc),moduleId:'word'});
}

function startControls(task){
  const actions=el('div',{className:'practice-work-list'});
  let opening=false;
  const progress=loadTaskProgress(task);
  const single=task.parts.length===1;
  const buttons=[];
  for(const [index,part] of task.parts.entries()){
    const started=Boolean(progress.files[index]);
    const label=started?'Продовжити':'Почати';
    const start=el('button',{type:'button',className:'primary',onClick:async()=>{
      if(opening)return;
      opening=true;
      actions.setAttribute('aria-busy','true');
      for(const button of buttons)button.disabled=true;
      start.textContent='Відкриваємо…';
      try{
        const storedId=loadTaskProgress(task).files[index];
        let file=typeof storedId==='string'?await getFile(storedId):null;
        if(!file||file.moduleId!==task.moduleId){
          file=await createTaskFile(task,part,index);
          const latest=loadTaskProgress(task);
          latest.files[index]=file.id;
          if(!saveTaskProgress(task,latest))notify('Файл збережено в «Мої файли». Не вдалося прив’язати його до завдання.');
        }
        if(start.isConnected)location.hash=`#editor/${task.moduleId||'word'}/${file.id}`;
      }catch(error){notify(error.message);}
      finally{
        opening=false;
        actions.removeAttribute('aria-busy');
        start.textContent=label;
        for(const button of buttons)button.disabled=false;
      }
    }},label);
    buttons.push(start);
    actions.append(single?start:el('section',{className:'practice-part'},
      el('div',{},el('h2',{},part.name),part.label?el('p',{className:'practice-meta'},part.label):null),
      start));
  }
  return actions;
}

function taskDetail(task){
  const metadata=[`${task.grade} клас`,editorTypes[task.moduleId],task.difficulty,task.duration].filter(Boolean).join(' · ');
  const start=task.moduleId==='windows'?
    el('a',{className:'button primary',href:`#editor/windows/${task.grade}:${task.id}`},'Відкрити ОС') : startControls(task);
  const instruction=instructionButton(task);
  const template=task.asset?el('a',{href:task.asset,download:task.assetName||'Практична_2 варіант 1.docx',className:'button'},'↓ Заготовка DOCX'):null;
  return el('article',{className:'practice-detail'},
    el('div',{className:'practice-detail-main'},
      artwork(task.moduleId),
      el('div',{},
        el('p',{className:'practice-meta'},metadata),
        el('h1',{},task.title),
        task.subtitle?el('p',{className:'practice-description'},task.subtitle):null)),
    el('div',{className:'practice-detail-actions'},start,el('div',{className:'practice-resources'},instruction,template)));
}

export function practice(root,grade,id){
  const page=el('div',{className:'practice-page'});
  root.append(page);
  const title=siteText('practice.title');
  if(!grade){
    const extra=textFields.filter(([key])=>key==='practice.intro'||key==='practice.welcome')
      .map(([key,,fallback])=>siteText(key)===fallback?'':siteText(key).trim()).filter(Boolean);
    page.append(titleBlock(title),...extra.map(value=>el('p',{className:'practice-description'},value)),gradeGallery());
    return;
  }
  if(!grades.some(n=>String(n)===grade)){
    page.append(titleBlock(title,backLink('#practice','Усі класи')),gradeGallery());
    return;
  }
  const available=tasksFor(grade);
  if(id){
    const task=available.find(item=>item.id===id);
    if(task)page.append(backLink(practicePath(grade),`${grade} клас`),taskDetail(task));
    else page.append(titleBlock('Завдання не знайдено',backLink(practicePath(grade),`${grade} клас`)));
    return;
  }
  page.append(titleBlock(`${grade} клас`,backLink('#practice','Усі класи')),gradeNavigation(grade));
  if(available.length)page.append(el('div',{className:'practice-task-grid'},...available.map(taskCard)));
  else page.append(el('div',{className:'practice-empty'},artwork('files'),el('p',{},'Поки без завдань')));
}
