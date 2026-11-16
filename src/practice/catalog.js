import { detectiveTask } from './grade45-detective.js';
import { task,loadProgress,saveProgress } from './grade9-text.js';
import { text3Task } from './grade9-text-3.js';
import { tableTask } from './grade6-table.js';
import { windowsTasks } from './windows-tasks.js';
import { getContent } from '../core/content/index.js';
import { classroomTimetable,mediaClub,weatherStation } from './public-examples.js';
const variants=[[tableTask,classroomTimetable],[task,mediaClub],[text3Task,weatherStation]];
export const baseTasks=[...[4,5].map(grade=>({...detectiveTask,grade})),...windowsTasks,...variants.map(([,example])=>example)];
export const tasks=[],allTasks=[];

async function hasMaterial(file){
  try{
    const response=await fetch(new URL('../../'+file,import.meta.url),{
      method:'HEAD', signal:globalThis.AbortSignal?.timeout?.(3500)
    });
    return response.ok&&!response.headers.get('content-type')?.startsWith('text/html');
  }catch{return false;}
}

export async function loadPracticeMaterials(){
  if(globalThis.location?.hostname?.endsWith('.github.io'))return;
  const loaded=await Promise.all(variants.map(async ([local,example])=>{
    const files=[local.asset,local.source,...(local.pages||[])].filter(Boolean);
    const available=await Promise.all(files.map(hasMaterial));
    return available.every(Boolean)?{...local,moduleId:local.moduleId||'word'}:example;
  }));
  baseTasks.splice(baseTasks.length-variants.length,variants.length,...loaded);
  refreshTasks();
}

export function refreshTasks(){
  const edits=getContent().tasks,merged=baseTasks.map(base=>{
    const edit=edits.find(t=>t.id===base.id&&t.grade===base.grade);
    if(!edit)return {...base};
    const result={...base,...edit,moduleId:base.moduleId};
    // Teacher edits can differ between grades even when the original shared a project.
    if(base.progressKey)result.progressKey=`informatyka.practice.${base.grade}.${base.id}.teacher.v1`;
    if(!edit.keepMaterials){
      delete result.pages;delete result.source;delete result.asset;delete result.formulas;
      delete result.sampleTable;delete result.starterWord;
    }
    return result;
  });
  for(const edit of edits)if(!baseTasks.some(t=>t.id===edit.id&&t.grade===edit.grade))merged.push({...edit,parts:edit.moduleId==='windows'?[]:[{name:edit.title.slice(0,100).replace(/[\\/\x00-\x1f]/g,' '),label:'Робота'}]});
  allTasks.splice(0,allTasks.length,...merged);tasks.splice(0,tasks.length,...merged.filter(t=>t.published!==false));
}
refreshTasks();window.addEventListener('site-content-changed',refreshTasks);
export function loadTaskProgress(item){
  if(item.grade===9&&item.id===task.id)return loadProgress();
  try{const value=JSON.parse(localStorage.getItem(item.progressKey||`informatyka.practice.${item.grade}.${item.id}.v1`)||'{}');return {files:Array.isArray(value.files)?value.files.slice(0,item.parts.length):[]};}catch{return {files:[]};}
}
export function saveTaskProgress(item,state){
  if(item.grade===9&&item.id===task.id)return saveProgress(state);
  try{localStorage.setItem(item.progressKey||`informatyka.practice.${item.grade}.${item.id}.v1`,JSON.stringify(state));return true;}catch{return false;}
}
