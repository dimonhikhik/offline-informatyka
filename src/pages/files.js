import { el,notify,download } from '../components/ui.js';
import { openNote } from '../components/note-editor.js';
import { listFiles,importFile,renameFile,deleteFile,getFile } from '../core/filesystem/index.js';
import { createBackup,restoreBackup } from '../core/filesystem/backup.js';
import { storageError } from '../core/storage/database.js';
import { artStyle } from './catalog-art.js';

const fileKinds=[
  ['archiver',/\.zip$/i,'ZIP'],
  ['vector',/\.svg$/i,'SVG'],
  ['raster',/\.(?:raster\.json|png|jpe?g|gif|bmp|webp|tiff?)$/i,'Растрове зображення'],
  ['browser',/\.browser\.json$/i,'Браузер'],
  ['excel',/\.(xlsx|csv|sheets\.json)$/i,'Таблиця'],
  ['powerpoint',/\.(pptx|slides\.json)$/i,'Презентація'],
  ['word',/\.(docx|word\.json)$/i,'Документ'],
  ['python',/\.(?:py|python\.json)$/i,'Python'],
  ['notes',/\.txt$/i,'Нотатка']
];
const fileDate=new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',year:'numeric'});
const sizeNumber=new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1});
const glyph=(symbol)=>el('span',{className:'library-glyph','aria-hidden':'true'},symbol);

function kindOf(file){
  return fileKinds.find(([id])=>file.moduleId===id)||fileKinds.find(([,pattern])=>pattern.test(file.name))||['files',null,'Файл'];
}

function artwork(id){
  return el('span',{className:'library-art',style:artStyle(id==='notes'?'word':id),'aria-hidden':'true'});
}

function formatSize(bytes){
  if(bytes<1024)return `${bytes} Б`;
  return bytes<1048576?`${sizeNumber.format(bytes/1024)} КБ`:`${sizeNumber.format(bytes/1048576)} МБ`;
}

export function filesPage(root){
  let busy=false,query='',order='date',allFiles=[],readVersion=0,openMenu;
  const status=el('p',{className:'library-status','aria-live':'polite'},'Відкриваємо файли…');
  const rows=el('div',{className:'library-file-list'});
  const page=el('section',{className:'library-page library-files'});
  const action=(label,onClick,attrs={})=>el('button',{type:'button',onClick,...attrs},label);

  async function refresh(){
    const version=++readVersion;
    const files=await listFiles();
    if(!page.isConnected||version!==readVersion)return;
    allFiles=files;
    render();
  }

  async function run(task,{update=false,onError=notify}={}){
    if(busy)return false;
    busy=true;
    toolbar.inert=true;
    rows.inert=true;
    toolbar.setAttribute('aria-busy','true');
    let completed=false;
    try{
      try{
        await task();
        completed=true;
      }catch(error){onError(storageError(error));}
      if(update)await refresh().catch(error=>{status.textContent=storageError(error);});
      return completed;
    }finally{
      busy=false;
      toolbar.inert=false;
      rows.inert=false;
      toolbar.removeAttribute('aria-busy');
    }
  }

  function formDialog(title,content,confirmLabel,task,{danger=false}={}){
    const feedback=el('p',{className:'library-form-error',role:'alert'});
    let submitting=false;
    const submit=el('button',{type:'submit',className:danger?'danger':'primary'},confirmLabel);
    const cancel=action('Скасувати',()=>dialog.close());
    const dialog=el('dialog',{className:'library-dialog','aria-label':title,onClose:()=>dialog.remove(),
      onCancel:event=>{if(submitting)event.preventDefault();}},
    el('form',{onSubmit:async event=>{
      event.preventDefault();
      if(submitting)return;
      feedback.textContent='';
      submitting=true;
      submit.disabled=true;
      cancel.disabled=true;
      const saved=await run(task,{update:true,onError:text=>{feedback.textContent=text;}});
      if(saved)dialog.close();
      else{
        submitting=false;
        submit.disabled=false;
        cancel.disabled=false;
      }
    }},el('h2',{},title),content,feedback,el('div',{className:'library-dialog-buttons'},cancel,submit)));
    page.append(dialog);
    dialog.showModal();
  }

  const importInput=el('input',{type:'file',multiple:true,hidden:true,onChange:event=>{
    const selected=[...event.target.files];
    event.target.value='';
    if(!selected.length)return;
    run(async()=>{
      let saved=0;
      try{
        for(const file of selected){await importFile(file);saved++;}
      }catch(error){throw Error(`Додано ${saved} із ${selected.length}. ${storageError(error)}`);}
      notify(`Додано файлів: ${saved}.`);
    },{update:true});
  }});
  const restoreInput=el('input',{type:'file',accept:'.json,application/json',hidden:true,onChange:event=>{
    const file=event.target.files[0];
    event.target.value='';
    if(file)formDialog('Відновити копію?',el('p',{},'Файли з копії буде додано до наявних робіт.'),'Відновити',
      async()=>notify(`Відновлено файлів: ${await restoreBackup(file)}.`));
  }});
  const importAction=()=>importInput.click();
  const noteAction=()=>openNote(undefined,refresh);
  const menu=(label,body,attrs={})=>el('details',{className:'library-menu'},
    el('summary',attrs,label),el('div',{className:'library-menu-actions'},body));
  const backups=menu([glyph('↻'),'Копії'],[
    action('Створити резервну копію',()=>run(async()=>download(await createBackup(),`інформатика-копія-${new Date().toISOString().slice(0,10)}.json`))),
    action('Відновити копію',()=>restoreInput.click())
  ]);
  const toolbar=el('div',{className:'library-toolbar'},
    action([glyph('↑'),'Імпортувати'],importAction,{className:'primary'}),
    action([glyph('+'),'Нотатка'],noteAction),backups,importInput,restoreInput);
  const search=el('input',{type:'search',placeholder:'Знайти файл…','aria-label':'Пошук файлів',onInput:event=>{
    query=event.target.value.trim().toLocaleLowerCase('uk');render();
  }});
  const sort=el('select',{'aria-label':'Сортування файлів',onChange:event=>{order=event.target.value;render();}},
    el('option',{value:'date'},'Спочатку нові'),el('option',{value:'name'},'За назвою'));

  function rename(file){
    const name=el('input',{value:file.name,maxlength:180,required:true,'aria-label':'Нова назва файлу',autofocus:true});
    formDialog('Перейменувати файл',name,'Зберегти',()=>renameFile(file.id,name.value));
  }

  function openNoteFile(id){
    return run(async()=>{
      const file=await getFile(id);
      if(!file)throw Error('Файл уже видалено.');
      if(file.size>2*1024*1024)throw Error('Текст до 2 МБ можна редагувати тут. Файл доступний для завантаження.');
      openNote(file,refresh);
    });
  }

  function row(file){
    const [type,,label]=kindOf(file);
    const downloadFile=()=>download(file.blob,file.name);
    const metadata=[label,formatSize(file.size)];
    if(Number.isFinite(file.updatedAt))metadata.push(fileDate.format(file.updatedAt));
    const preview=[artwork(type),el('span',{className:'library-file-title'},
      el('strong',{},file.name),el('small',{},metadata.join(' · '))),glyph(type==='files'?'↓':'→')];
    const entry={className:'library-entry','aria-label':`${type==='files'?'Завантажити':'Відкрити'} «${file.name}»`};
    const primary=type==='notes'?action(preview,()=>openNoteFile(file.id),entry):
      type==='files'?action(preview,downloadFile,entry):
      el('a',{...entry,href:`#editor/${type}/${file.id}`},preview);
    const overflow=menu(glyph('⋯'),[
      type!=='files'?action('Завантажити',downloadFile):null,
      action('Перейменувати',()=>rename(file)),
      action('Видалити',()=>formDialog('Видалити файл?',el('p',{},`«${file.name}» буде видалено з цього браузера.`),'Видалити',
        ()=>deleteFile(file.id),{danger:true}),{className:'danger'})
    ],{'aria-label':`Дії з файлом «${file.name}»`,className:'library-more'});
    return el('article',{className:'library-file'},primary,overflow);
  }

  function render(){
    const files=allFiles.filter(file=>file.name.toLocaleLowerCase('uk').includes(query));
    files.sort(order==='name'?(a,b)=>a.name.localeCompare(b.name,'uk'):(a,b)=>b.updatedAt-a.updatedAt);
    status.textContent=query?`Знайдено: ${files.length}`:allFiles.length?`Файлів: ${allFiles.length}`:'';
    rows.replaceChildren(...files.map(row));
    if(openMenu&&!openMenu.isConnected)openMenu=null;
    if(files.length)return;
    const title=allFiles.length?'Файлів не знайдено':'Файлів ще немає';
    rows.append(el('div',{className:'library-empty'},artwork('files'),el('h2',{},title),
      allFiles.length?action('Очистити пошук',()=>{search.value='';query='';render();search.focus();}):null));
  }

  page.addEventListener('toggle',event=>{
    const target=event.target;
    if(!target.matches('.library-menu'))return;
    if(target.open){
      if(openMenu&&openMenu!==target)openMenu.open=false;
      openMenu=target;
    }else if(openMenu===target)openMenu=null;
  },true);
  page.addEventListener('click',event=>{
    const detail=event.target.closest('.library-menu');
    if(event.target.closest('.library-menu-actions button')&&detail)detail.open=false;
    else if(openMenu&&openMenu!==detail)openMenu.open=false;
  });
  page.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&openMenu?.open){
      openMenu.open=false;
      openMenu.querySelector('summary').focus();
    }
  });

  page.append(el('h1',{},'Мої файли'),toolbar,el('div',{className:'library-search'},
    el('label',{className:'library-search-field'},glyph('⌕'),search),sort),status,rows);
  root.append(page);
  refresh().catch(error=>{
    status.textContent=storageError(error);
    rows.replaceChildren(action('Спробувати знову',()=>run(refresh)));
  });
}
