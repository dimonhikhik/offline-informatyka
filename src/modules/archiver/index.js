import { el,heading,download } from '../../components/ui.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { createZipWorker } from './zip-service.js';
import { MAX_BYTES,validateEntries,validPath } from './limits.js';
import { contextMenu } from '../../components/context-menu.js';
const size = n => n<1024 ? `${n} Б` : n<1048576 ? `${(n/1024).toFixed(1)} КБ` : `${(n/1048576).toFixed(2)} МБ`;
// Keep the standalone editor's worker ready across hash navigation in this tab.
const standaloneZip=createZipWorker();
export function mount(root,{filesystem:fs,notify,fileId,rememberWork,resume,embedded=false,onExtract,onClose}) {
  let entries=[], folder='', record, busy=false, saving=false, disposed=false, lastBlob, query='';
  const zip=embedded?createZipWorker():standaloneZip;
  const name=el('input',{value:'Мій архів.zip',maxlength:180,'aria-label':'Назва архіву'});
  const level=el('select',{'aria-label':'Рівень стиснення'},el('option',{value:'0'},'Без стиснення'),el('option',{value:'6',selected:true},'Звичайне стиснення'),el('option',{value:'9'},'Сильніше стиснення'));
  const getPosition=()=>({folder,level:level.value});
  const startingMessage='Додай файли — архів збережеться автоматично.';
  const message=el('p',{className:'archive-status','aria-live':'polite'},startingMessage);
  const stats=el('div',{className:'archive-stats','aria-live':'polite'});
  const rows=el('div',{className:'archive-list'});
  const crumbs=el('nav',{className:'archive-crumbs','aria-label':'Папки архіву'});
  const work=el('div',{className:'archive-work'});
  const controls=el('div',{className:'archive-controls'});
  const host=el('section',{className:'zip-app'+(embedded?' zip-embedded':'')});
  const context=contextMenu(host);
  function rowMenu(row){return [...row.querySelectorAll('.file-actions button')].map(b=>({label:b.textContent,action:()=>b.click()}));}
  context.bind(rows,e=>{const row=e.target.closest('.archive-row');if(!row)return [{label:'Додати файли…',action:()=>addInput.click()},{label:'Розпакувати все…',action:()=>run(extractAll)}];rows.querySelectorAll('.archive-row').forEach(r=>r.classList.toggle('is-selected',r===row));return rowMenu(row);});
  function lock() { controls.inert=busy||saving;work.inert=busy||saving; }
  function archiveName() {
    let value=name.value.trim();
    if(!value) throw new Error('Введи назву архіву.');
    if(!/\.zip$/i.test(value)) value+='.zip';
    if(value.length>180 || /[\\/\x00-\x1f]/.test(value)) throw new Error('Назва архіву: до 180 символів, без слешів.');
    return value;
  }
  const autosave=createAutosave(async()=>{
    const filename=archiveName();
    const bytes=await zip.run({action:'create',entries,level:Number(level.value)});
    const blob=new Blob([bytes],{type:'application/zip'});
    record=await fs.saveFile({...record,name:filename,blob,moduleId:'archiver'});
    rememberWork?.(record,{position:getPosition()});
    lastBlob=blob;renderStats();
  },(state,error)=>{
    saving=state==='saving';lock();
    message.textContent={dirty:'Є зміни. Готуємо автозбереження…',saving:'Стискаємо та зберігаємо ZIP…',saved:embedded?'Збережено на віртуальному диску.':'Збережено в «Мої файли».'}[state] || `Не збережено. ${storageError(error)} Можна повторити збереження або експортувати ZIP.`;
  },1200);
  const changed=()=>{lastBlob=undefined;autosave.change();render();};
  async function run(action,{flush=true}={}) {
    if(busy||saving||disposed)return;
    busy=true;lock();
    try { if(flush)await autosave.flush();await action(); }
    catch(error){if(!disposed){message.textContent=storageError(error);notify(storageError(error));}}
    finally{busy=false;if(!disposed)lock();}
  }
  function totalBytes(){return entries.reduce((n,item)=>n+item.data.length,0);}
  function renderStats(){
    const original=totalBytes(), packed=lastBlob?.size;
    stats.replaceChildren(el('div',{},el('small',{},'Файлів'),el('strong',{},String(entries.filter(e=>!e.path.endsWith('/')).length))),
      el('div',{},el('small',{},'До стиснення'),el('strong',{},size(original))),
      el('div',{},el('small',{},'Розмір ZIP'),el('strong',{},packed===undefined?'Після збереження':size(packed))),
      el('div',{},el('small',{},'Результат'),el('strong',{},packed===undefined||!original?'—':packed<=original?`Менше на ${((1-packed/original)*100).toFixed(1)}%`:`Більше на ${((packed/original-1)*100).toFixed(1)}%`)));
  }
  function render(){
    renderStats();
    crumbs.replaceChildren(el('button',{onClick:()=>{folder='';render();}},'⌂ Архів'));
    let path='';
    for(const part of folder.split('/').filter(Boolean)) {path+=part+'/';const target=path;crumbs.append(el('span',{},'›'),el('button',{onClick:()=>{folder=target;render();}},part));}
    const visible=new Map();
    for(const entry of entries){
      if(!entry.path.startsWith(folder) || entry.path===folder)continue;
      const remainder=entry.path.slice(folder.length), first=remainder.split('/')[0], isFolder=remainder.includes('/');
      const path=folder+first+(isFolder?'/':'');
      if(!query || first.toLocaleLowerCase('uk').includes(query))visible.set(path,{path,label:first,isFolder,data:entry.data});
    }
    rows.replaceChildren(...[...visible.values()].sort((a,b)=>Number(b.isFolder)-Number(a.isFolder)||a.label.localeCompare(b.label,'uk')).map(item=>el('article',{className:'archive-row'},
      el('div',{className:'archive-item'},el('span',{'aria-hidden':'true',className:'archive-file-icon'},item.isFolder?'▰':'▤'),
        item.isFolder?el('button',{className:'folder-link',onClick:()=>{folder=item.path;query='';search.value='';render();}},item.label):el('strong',{},item.label),
        el('small',{},item.isFolder?'Папка':size(item.data.length))),
      el('div',{className:'file-actions'},
        !item.isFolder?el('button',{onClick:()=>download(new Blob([item.data]),item.label)},'Завантажити'):null,
        el('button',{onClick:()=>run(async()=>{
          const answer=prompt('Нова назва',item.label);if(answer===null)return;
          const base=answer.trim();if(!base || /[\\/]/.test(base))throw new Error('Введи назву без слешів.');
          const next=folder+base+(item.isFolder?'/':'');validPath(next);
          const updated=entries.map(e=>e.path===item.path||item.isFolder&&e.path.startsWith(item.path)?{...e,path:next+e.path.slice(item.path.length)}:e);
          validateEntries(updated);entries=updated;changed();
        })},'Перейменувати'),
        el('button',{className:'danger',onClick:()=>run(async()=>{if(confirm(`Прибрати «${item.label}»${item.isFolder?' з усім вмістом':''} з архіву?`)){entries=entries.filter(e=>e.path!==item.path&&!(item.isFolder&&e.path.startsWith(item.path)));changed();}})},'Прибрати')))));
    if(!visible.size)rows.append(el('div',{className:'empty'},el('h2',{},query?'Нічого не знайдено':'Тут поки порожньо'),el('p',{},'Додай файли або створи папку.')));
    for(const row of rows.querySelectorAll('.archive-row')){
      row.tabIndex=0;row.addEventListener('click',()=>rows.querySelectorAll('.archive-row').forEach(r=>r.classList.toggle('is-selected',r===row)));
      row.addEventListener('dblclick',()=>row.querySelector('.folder-link')?.click());
      row.append(el('button',{className:'zip-row-menu','aria-label':'Дії з файлом або папкою',onClick:e=>{const rect=e.currentTarget.getBoundingClientRect();context.open(rowMenu(row),rect.right,rect.bottom);}},'⋯'));
    }
  }
  async function addFiles(files){
    const incoming=[];let bytes=totalBytes();
    for(const file of files){
      bytes+=file.blob.size;
      if(bytes>MAX_BYTES)throw new Error('Загальний розмір — до 25 МБ.');
      incoming.push({path:validPath(folder+file.name),data:new Uint8Array(await file.blob.arrayBuffer())});
    }
    const updated=[...entries,...incoming];validateEntries(updated);entries=updated;changed();
  }
  async function openArchive(blob,filename,stored,position){
    if(blob.size>MAX_BYTES)throw new Error('ZIP має бути не більшим за 25 МБ.');
    const result=await zip.run({action:'open',bytes:await blob.arrayBuffer()});
    entries=result;folder='';record=stored;name.value=filename;lastBlob=blob;query='';search.value='';
    if(typeof position?.folder==='string'&&position.folder.endsWith('/')&&entries.some(entry=>entry.path.startsWith(position.folder)))folder=position.folder;
    if(['0','6','9'].includes(position?.level))level.value=position.level;
    render();
    if(stored){
      message.textContent='Архів відкрито. Можна змінювати його вміст.';
      rememberWork?.(stored,{position:getPosition()});
    }else autosave.change();
  }
  const addInput=el('input',{type:'file',multiple:true,hidden:true,onChange:e=>{const files=[...e.target.files];e.target.value='';if(files.length)run(()=>addFiles(files.map(f=>({name:f.name,blob:f}))));}});
  const openInput=el('input',{type:'file',accept:'.zip,application/zip',hidden:true,onChange:e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>openArchive(file,file.name));}});
  const search=el('input',{type:'search',placeholder:'Знайти в цій папці…','aria-label':'Пошук в архіві',onInput:e=>{query=e.target.value.toLocaleLowerCase('uk');render();}});
  async function chooseFiles(){
    const files=await fs.listFiles();
    const selected=new Set();
    const list=el('div',{className:'archive-picker-list'},...files.map(file=>el('label',{},el('input',{type:'checkbox',onChange:e=>{e.target.checked?selected.add(file):selected.delete(file);}}),el('span',{},file.name),el('small',{},size(file.size)))));
    const dialog=el('dialog',{className:'note-dialog',onClose:()=>dialog.remove()},el('h2',{},embedded?'Додати з віртуального диска':'Додати з «Моїх файлів»'),files.length?list:el('p',{},'Збережених файлів ще немає.'),
      el('div',{className:'actions'},el('button',{className:'primary',onClick:()=>{dialog.close();run(()=>addFiles([...selected]));}},'Додати вибрані'),el('button',{onClick:()=>dialog.close()},'Скасувати')));
    host.append(dialog);dialog.showModal();
  }
  async function extractAll(){
    if(onExtract){await onExtract(entries);return;}
    const files=entries.filter(e=>!e.path.endsWith('/'));
    if(!files.length){notify('В архіві немає файлів.');return;}
    if(!confirm(`Додати ${files.length} файлів до «Моїх файлів»? Папки будуть позначені в назвах через « — ». Наявні файли залишаться.`))return;
    let count=0;
    try {
      for(const file of files){
        let filename=file.path.replaceAll('/',' — ');
        if(filename.length>180){const leaf=file.path.split('/').pop();filename=`${count+1} — ${leaf}`.slice(-180);}
        await fs.saveFile({name:filename,blob:new Blob([file.data],{type:/\.txt$/i.test(filename)?'text/plain;charset=utf-8':'application/octet-stream'}),moduleId:/\.txt$/i.test(filename)?'notes':'import'});count++;
      }
      notify(`Розпаковано файлів: ${count}. Відкрий «Мої файли».`);
    }catch(error){throw new Error(`Розпаковано ${count} із ${files.length}. ${storageError(error)}`);}
  }
  controls.append(el('div',{className:'archive-name'},el('label',{},'Назва ZIP',name),el('label',{},'Стиснення',level)),
    el('div',{className:'actions'},
      el('button',{onClick:()=>run(async()=>{entries=[];folder='';record=undefined;lastBlob=undefined;name.value='Мій архів.zip';changed();})},'+ Новий архів'),
      el('button',{onClick:()=>openInput.click()},'Відкрити ZIP'),
      el('button',{className:'primary',onClick:()=>run(async()=>{if(!autosave.dirty())autosave.change();await autosave.flush();},{flush:false})},'Зберегти'),
      el('button',{onClick:()=>run(async()=>{
        try { await autosave.flush(); } catch { /* Export remains available when storage fails. */ }
        const filename=archiveName();
        const bytes=await zip.run({action:'create',entries,level:Number(level.value)});
        const blob=new Blob([bytes],{type:'application/zip'});download(blob,filename);lastBlob=blob;renderStats();
        message.textContent='ZIP передано на завантаження. '+(autosave.dirty()?'У браузері ще є незбережені зміни.':'');
      },{flush:false})},'Експортувати ZIP'),
      ),addInput,openInput);
  name.addEventListener('input',()=>autosave.change());level.addEventListener('change',changed);
  work.append(el('div',{className:'actions'},el('button',{className:'primary',onClick:()=>addInput.click()},'↑ Додати файли'),el('button',{onClick:()=>run(chooseFiles)},embedded?'З віртуального диска':'З «Моїх файлів»'),
    el('button',{onClick:()=>run(async()=>{const answer=prompt('Назва папки');if(answer===null)return;const value=answer.trim();if(!value||/[\\/]/.test(value))throw new Error('Введи назву папки без слешів.');const updated=[...entries,{path:validPath(folder+value+'/'),data:new Uint8Array()}];validateEntries(updated);entries=updated;changed();})},'+ Папка'),
    el('button',{onClick:()=>run(extractAll)},'Розпакувати все')),el('div',{className:'archive-navigation'},crumbs,search),rows);
  const titlebar=el('header',{className:'zip-titlebar'},el('strong',{},'Архіватор ZIP'),embedded?el('button',{onClick:()=>onClose?.(),'aria-label':'Закрити архіватор'},'×'):el('a',{href:'#catalog',className:'button'},'← До каталогу'));
  host.append(titlebar,controls,work,stats,message,
    el('details',{className:'panel archive-help'},el('summary',{},'Довідка про ZIP'),
      el('p',{},'До 25 МБ і 500 записів. Підтримується ZIP без пароля. Фото й відео часто вже стиснуті.'),
      el('p',{},embedded?'Розпакування створює папку на віртуальному диску.':'У «Моїх файлах» шляхи вкладених файлів стають частиною їхніх назв.')));
  root.append(host);if(!embedded)document.body.classList.add('zip-focus-mode');
  const leave=e=>{if(autosave.dirty()||busy||saving){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',leave);render();
  if(fileId)run(async()=>{const file=await fs.getFile(fileId);if(!file)throw new Error('Архів уже видалено.');await openArchive(file.blob,file.name,file,resume?.position);});
  else if(!embedded){
    message.textContent='Готуємо архіватор…';
    run(async()=>{await zip.prepare();message.textContent=startingMessage;},{flush:false});
  }
  return {
    getResumePosition(id){if(record?.id===id)return getPosition();},
    async canLeave(){
      if(busy){notify('Дочекайся завершення операції з архівом.');return false;}
      try{await autosave.flush();return true;}catch{return confirm('Архів не збережено. Вийти й втратити зміни? Можна залишитися та експортувати ZIP.');}
    },
    dispose(){disposed=true;autosave.dispose();if(embedded)zip.dispose();context.dispose();if(!embedded)document.body.classList.remove('zip-focus-mode');window.removeEventListener('beforeunload',leave);},
  };
}
