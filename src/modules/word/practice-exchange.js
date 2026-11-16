import { el } from '../../components/ui.js';
import { projectBlob,readProject } from './model.js';
import { decideReview,prepareReview,reviewPanel,startReview } from './review.js';

const validId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const projectName=value=>String(value).replace(/\.word\.json$/i,'');

function keyFor(sourceId){
  return 'informatyka.practice.9.text-3.exchange.'+sourceId;
}

function savedCopies(sourceId){
  const copies={};
  if(sourceId)try{
    const saved=JSON.parse(localStorage.getItem(keyFor(sourceId))||'{}');
    for(const key of ['peerFileId','ownReviewId'])if(validId(saved?.[key]))copies[key]=saved[key];
  }catch{/* The copies are still available in «Мої файли». */}
  return copies;
}

function rememberCopy(sourceId,field,id){
  if(sourceId)try{
    localStorage.setItem(keyFor(sourceId),JSON.stringify({...savedCopies(sourceId),[field]:id}));
  }catch{/* The project remains saved in «Мої файли». */}
}

export function createPracticeExchange({fs,getState,applyDocument,setReview,removeContents,openObjects,run,dialog,dialogError,notify}){
  let intent,modal,panel,nameField,transfer;
  function requestFile(kind){
    const {practiceFileId,record}=getState();
    intent={kind,practiceFileId,documentId:practiceFileId||record?.id};
    input.click();
  }
  const input=el('input',{type:'file',accept:'.json,application/json',hidden:true,onChange:event=>{
    const file=event.target.files[0],selected=intent;
    event.target.value='';
    if(!file||!selected)return;
    modal?.close();
    run(async()=>{
      const next=await readProject(file);
      const own=selected.kind==='own';
      if(!own&&next.review?.mode!=='editing'){
        throw new Error('Вибери копію, яку підготували через «Рецензування».');
      }
      if(own&&(next.review?.mode!=='deciding'||(selected.practiceFileId&&next.review.sourceId&&next.review.sourceId!==selected.documentId))){
        throw new Error('Вибери повернений файл з правками до твоєї роботи.');
      }
      const stored=await fs.saveFile({name:projectName(file.name)+'.word.json',blob:projectBlob(next),moduleId:'word'});
      rememberCopy(selected.practiceFileId,own?'ownReviewId':'peerFileId',stored.id);
      applyDocument(next,stored.name,stored,selected.practiceFileId);
    },{flush:true});
  }});
  function resume(id,sourceId){
    modal?.close();
    run(async()=>{
      const stored=await fs.getFile(id);
      if(!stored)throw new Error('Цю копію видалено з «Моїх файлів». Відкрий файл знову.');
      applyDocument(await readProject(stored.blob),stored.name,stored,sourceId);
    },{flush:true});
  }
  function offerDownload(blob,filename){
    if(!modal?.open)throw new Error('Відкрий рецензування й підготуй файл ще раз.');
    const url=URL.createObjectURL(blob);
    modal.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});
    const link=el('a',{className:'button primary',href:url,download:filename},'Завантажити файл');
    transfer.hidden=false;
    transfer.replaceChildren(el('p',{},filename),link);
    transfer.scrollIntoView({block:'nearest'});
  }
  function withReviewDialog(action){
    run(async()=>{
      try{action(getState());}
      catch(error){if(modal?.open)dialogError(modal,error.message);else notify(error.message);}
    },{flush:true});
  }
  function shareOriginal(){
    withReviewDialog(({doc,name,record})=>{
      const label=projectName(name.trim());
      if(!label||label.length>150||/[\\/\x00-\x1f]/.test(label))throw new Error('Вкажи назву до 150 символів без слешів.');
      offerDownload(projectBlob({...doc,review:startReview(doc.html,{sourceId:record?.id})}),label+'.word.json');
    });
  }
  function sendReview(filename){
    withReviewDialog(({doc})=>{
      const label=projectName(filename.trim());
      if(!label||label.length>150||/[\\/\x00-\x1f]/.test(label))throw new Error('Вкажи назву до 150 символів без слешів.');
      const review=prepareReview(doc.html,doc.review);
      offerDownload(projectBlob({...doc,review}),label+'.word.json');
    });
  }
  function refresh(){
    if(!modal?.open)return;
    nameField.hidden=getState().doc.review?.mode!=='editing';
    panel?.refresh();
  }
  function open(){
    const {doc,record,name,practiceFileId}=getState();
    const button=(label,onClick)=>el('button',{type:'button',onClick},label);
    const controls=[];
    if(!doc.review)controls.push(button('Завантажити мою роботу для класу',shareOriginal));
    if(practiceFileId){
      const copies=savedCopies(practiceFileId);
      if(record?.id!==practiceFileId)controls.push(button('Повернутися до моєї роботи',()=>resume(practiceFileId,practiceFileId)));
      if(copies.peerFileId&&record?.id!==copies.peerFileId)controls.push(button('Продовжити правки однокласника',()=>resume(copies.peerFileId,practiceFileId)));
      if(copies.ownReviewId&&record?.id!==copies.ownReviewId)controls.push(button('Продовжити перегляд моїх правок',()=>resume(copies.ownReviewId,practiceFileId)));
    }
    controls.push(button('Відкрити роботу однокласника',()=>requestFile('peer')),button('Відкрити повернений файл',()=>requestFile('own')));
    if(doc.review?.mode==='editing')controls.push(button('Стилі таблиці й малюнка',()=>{modal.close();openObjects();}));
    const filename=el('input',{value:projectName(name).replace(/_ред$/iu,'')+'_ред',maxlength:150});
    nameField=el('label',{className:'word-field',hidden:true},el('span',{},'Назва файлу з правками'),filename);
    transfer=el('div',{className:'word-review-download',hidden:true,'aria-live':'polite'});
    panel=reviewPanel({
      getDocument:()=>getState().doc,
      begin:()=>{try{const current=getState().doc;setReview(current.html,startReview(current.html));}catch(error){dialogError(modal,error.message);}},
      send:()=>sendReview(filename.value),
      decide:(id,accept)=>{
        try{
          const current=getState().doc,next=decideReview(current.html,current.review,id,accept);
          setReview(next.html,next.review);
        }catch(error){dialogError(modal,error.message);}
      },
      finish:()=>modal.close(),
      removeContents
    });
    modal=dialog('Рецензування',el('div',{className:'word-review-actions'},controls),
      el('div',{className:'word-review-work'},nameField,panel.root),transfer,input);
    refresh();
  }
  return {open,refresh};
}
