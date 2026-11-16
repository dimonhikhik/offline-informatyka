import { el,download } from '../../components/ui.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { guideFor } from '../../practice/guide.js';
import { blankProject,readProject,projectBlob,scriptBlob,projectExtension,cleanProjectName,addProjectFile,checkFilename,maxFileSize,maxTotalSize } from './project.js';
import { createRunner } from './runner.js';
import { createGuide } from './guide.js';
import { createTkView } from './tk-view.js';

const button=(label,onClick,attrs={})=>el('button',{type:'button',onClick,...attrs},label);
const icon=(mark,label,onClick,attrs={})=>button(mark,onClick,{title:label,'aria-label':label,...attrs});
const isScript=name=>/\.py$/i.test(name);
const libraries={
  numpy:['NumPy','import numpy as np'],sympy:['SymPy','import sympy as sp'],
  pillow:['Pillow','from PIL import Image'],mpmath:['mpmath','import mpmath'],tzdata:['Часові пояси','from zoneinfo import ZoneInfo']
};
const keywords=new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case True False None'.split(' '));
const builtins=new Set('print input int str float bool len range list dict set tuple sum min max sorted open enumerate round abs zip type'.split(' '));
const syntax=/#.*|"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\b(?:0[xob][a-f\d]+|\d+(?:\.\d+)?)\b|\b[A-Za-z_][A-Za-z_\d]*\b/gi;

function paintCode(node,text,enabled){
  if(!enabled||text.length>30000){node.textContent=text+'\n';return;}
  const fragment=document.createDocumentFragment();
  let end=0;
  for(const match of text.matchAll(syntax)){
    const token=match[0],start=match.index;
    const kind=token.startsWith('#')?'comment':/^['"]/.test(token)?'string':/^\d/.test(token)?'number':
      keywords.has(token)?'keyword':builtins.has(token)?'builtin':null;
    if(!kind)continue;
    fragment.append(text.slice(end,start),el('span',{className:'python-token-'+kind},token));
    end=start+token.length;
  }
  fragment.append(text.slice(end),'\n');
  node.replaceChildren(fragment);
}

export function mount(root,{filesystem,notify,fileId,rememberWork,resume}){
  let project=blankProject(),record,active=project.entry,disposed=false,opening=false,loading=Promise.resolve();
  let state='boot',runtimePackages=[],guideKey,session=false,renderFrame,outputFrame,dialog;
  let transcript='',outputCapped=false;
  const positions=new Map();
  const host=el('section',{className:'python-editor','aria-label':'Середовище Python','data-view':'code'});
  const name=el('input',{value:'Моя програма',maxlength:125,'aria-label':'Назва проєкту'});
  const status=el('span',{className:'python-status',role:'status'},'Готуємо Python…');
  const files=el('div',{className:'python-file-tabs','aria-label':'Файли проєкту'});
  const editor=el('textarea',{className:'python-source','aria-label':'Код програми',wrap:'off',spellcheck:'false',
    autocapitalize:'off',autocorrect:'off',autocomplete:'off',maxlength:maxFileSize});
  const ink=el('pre',{className:'python-highlight','aria-hidden':'true'});
  const gutter=el('pre',{className:'python-lines','aria-hidden':'true'});
  const terminal=el('pre',{className:'python-terminal',tabindex:0,'aria-label':'Вивід програми'});
  const stdin=el('textarea',{rows:3,maxlength:20000,'aria-label':'Рядки для input()',placeholder:'Один рядок на кожен input()'});
  const inputExplanation=el('p',{className:'python-note'},'Задай відповіді у порядку викликів input().');
  const inputValue=el('input',{type:'text',maxlength:2000,'aria-label':'Відповідь для input()',autocomplete:'off'});
  const inputLabel=el('label',{className:'python-input-prompt'},'Введи значення',inputValue);
  const inputForm=el('form',{className:'python-live-input',hidden:true,onSubmit:event=>{
    event.preventDefault();
    if(state!=='input')return;
    const value=inputValue.value;
    inputValue.value='';inputForm.hidden=true;
    appendOutput(value+'\n');setState('running','Виконуємо…');
    runner.send({type:'input',value});
  }},inputLabel,el('button',{type:'submit',className:'primary'},'Ввести'));
  const result=el('section',{className:'python-pane python-result','aria-label':'Результат'},terminal,inputForm,
    el('details',{className:'python-stdin'},el('summary',{},'Рядки для input()'),inputExplanation,stdin));
  const tk=createTkView(message=>{if(session||state==='running'||state==='input')runner.send(message);});
  const tkIntro=el('p',{className:'python-note'},'Запусти програму з Tkinter, щоб побачити її вікно.');
  const tkPane=el('section',{className:'python-pane python-window','aria-label':'Вікно Tkinter'},tkIntro,tk.element);
  const guidePane=el('section',{className:'python-pane python-guide-pane','aria-label':'Довідка Python'});
  const packageList=el('div',{className:'python-packages'});
  const activeFile=()=>project.files.find(file=>file.name===active);
  const getPosition=()=>({file:active,start:editor.selectionStart,end:editor.selectionEnd,top:editor.scrollTop,left:editor.scrollLeft});
  const autosave=createAutosave(async()=>{
    record=await filesystem.saveFile({...record,name:cleanProjectName(name.value)+projectExtension,
      blob:projectBlob(project),moduleId:'python'});
    if(!disposed)rememberWork?.(record,{position:getPosition()});
  },(phase,error)=>{
    if(disposed)return;
    saveButton.dataset.state=phase;
    const title={dirty:'Є зміни',saving:'Зберігаємо…',saved:'Збережено на пристрої'}[phase]??storageError(error);
    saveButton.title=title;
    saveButton.setAttribute('aria-label',title);
    if(phase==='error')notify(title);
  },650);

  function syncScroll(){
    ink.scrollTop=editor.scrollTop;ink.scrollLeft=editor.scrollLeft;gutter.scrollTop=editor.scrollTop;
  }
  function paint(){
    renderFrame=undefined;
    paintCode(ink,editor.value,isScript(active));
    const count=editor.value.split('\n').length;
    gutter.textContent=Array.from({length:count},(_,i)=>i+1).join('\n')+'\n';
    syncScroll();
  }
  function codeChanged(){
    activeFile().text=editor.value;
    autosave.change();
    renderFrame??=requestAnimationFrame(paint);
  }
  editor.addEventListener('input',codeChanged);
  editor.addEventListener('scroll',syncScroll);
  stdin.addEventListener('input',()=>{project.input=stdin.value;autosave.change();});
  name.addEventListener('input',()=>autosave.change());

  function replaceSelection(text,selectFrom){
    const start=editor.selectionStart,end=editor.selectionEnd;
    if(editor.value.length-(end-start)+text.length>editor.maxLength)return;
    editor.focus({preventScroll:true});
    editor.setRangeText(text,start,end,'end');
    if(selectFrom!==undefined)editor.setSelectionRange(start+selectFrom,start+selectFrom);
    codeChanged();
  }
  function pair(left,right){
    const chosen=editor.value.slice(editor.selectionStart,editor.selectionEnd);
    replaceSelection(left+chosen+right,chosen?undefined:left.length);
  }
  function moveCaret(direction){
    const current=direction<0?editor.selectionStart:editor.selectionEnd;
    const target=editor.selectionStart===editor.selectionEnd?current+direction:current;
    const index=Math.max(0,Math.min(editor.value.length,target));
    editor.focus({preventScroll:true});editor.setSelectionRange(index,index);
  }
  const keyboard=el('div',{className:'python-keys','aria-label':'Символи Python'});
  for(const [text,hint,action] of [
    ['⇥','Відступ 4 пробіли',()=>replaceSelection('    ')],[':','Двокрапка',()=>replaceSelection(':')],
    ['()','Круглі дужки',()=>pair('(',')')],['[]','Квадратні дужки',()=>pair('[',']')],
    ['""','Лапки',()=>pair('"','"')],['=','Знак рівності',()=>replaceSelection('=')],
    ['_','Підкреслення',()=>replaceSelection('_')],['#','Коментар',()=>replaceSelection('#')],
    ['‹','Курсор ліворуч',()=>moveCaret(-1)],['›','Курсор праворуч',()=>moveCaret(1)]
  ]){
    const key=icon(text,hint,action);
    key.addEventListener('pointerdown',event=>event.preventDefault());
    keyboard.append(key);
  }
  editor.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();replaceSelection('    ');return;}
    if(event.key!=='Enter'||event.ctrlKey||event.metaKey||!isScript(active))return;
    const start=editor.selectionStart,line=editor.value.slice(editor.value.lastIndexOf('\n',start-1)+1,start);
    const indent=line.match(/^[ \t]*/)[0]+(line.trimEnd().endsWith(':')?'    ':'');
    event.preventDefault();replaceSelection('\n'+indent);
  });

  function renderFiles(){
    files.replaceChildren(...project.files.map(file=>button(file.name,()=>openFile(file.name),
      {'aria-pressed':file.name===active,title:file.name===project.entry?'Головний файл':file.name})));
    const otherSize=project.files.reduce((size,file)=>size+(file.name===active?0:file.text.length),0);
    editor.maxLength=Math.min(maxFileSize,maxTotalSize-otherSize);
    mainFile.disabled=!isScript(active)||active===project.entry;
    removeFile.disabled=active===project.entry;
    exportPy.disabled=!isScript(active);
    runButton.title='Запустити '+project.entry;
  }
  function openFile(filename,position){
    if(filename!==active)positions.set(active,getPosition());
    active=filename;
    const saved=position??positions.get(filename);
    const text=activeFile().text;
    editor.value=text;
    editor.setAttribute('aria-label',isScript(active)?'Код '+active:'Файл '+active);
    const start=Math.min(text.length,Math.max(0,Number(saved?.start)||0));
    const end=Math.min(text.length,Math.max(start,Number(saved?.end)||start));
    editor.setSelectionRange(start,end);
    paint();
    editor.scrollTop=Number(saved?.top)||0;editor.scrollLeft=Number(saved?.left)||0;syncScroll();
    renderFiles();
  }

  const panes={result,tk:tkPane,guide:guidePane},tabs=new Map();
  const nav=el('nav',{className:'python-nav','aria-label':'Панелі Python'});
  for(const [key,mark,label] of [['code','‹›','Код'],['result','▤','Вивід'],['tk','▣','Вікно'],['guide','?','Довідка']]){
    const control=button(el('span',{},el('b',{'aria-hidden':'true'},mark),label),()=>show(key),{'aria-pressed':'false'});
    tabs.set(key,control);nav.append(control);
  }
  function show(key){
    host.dataset.view=key;
    const right=key==='code'?'result':key;
    for(const [id,pane] of Object.entries(panes))pane.hidden=id!==right;
    for(const [id,control] of tabs)control.setAttribute('aria-pressed',String(id===key));
  }
  function appendOutput(value){
    if(typeof value!=='string'||!value.length||outputCapped)return;
    const free=100000-transcript.length;
    transcript+=value.slice(0,free);
    if(value.length>free){transcript+='\n… Вивід скорочено.\n';outputCapped=true;}
    outputFrame??=requestAnimationFrame(()=>{
      outputFrame=undefined;terminal.textContent=transcript;terminal.scrollTop=terminal.scrollHeight;
    });
  }
  function clearOutput(){
    transcript='';outputCapped=false;terminal.textContent='';
    cancelAnimationFrame(outputFrame);outputFrame=undefined;
  }
  function setState(next,message){
    state=next;status.textContent=message;
    runButton.disabled=opening||['boot','running','input'].includes(next);
    stopButton.disabled=!session&&!['running','input'].includes(next);
    runButton.textContent=next==='error'?'↻ Python':'▶ Запустити';
  }
  function receive(message){
    if(disposed)return;
    if(message.type==='loading'){setState('boot','Готуємо Python…');return;}
    if(message.type==='ready'){
      runtimePackages=Array.isArray(message.packages)?message.packages.filter(name=>Object.hasOwn(libraries,name)):[];
      inputExplanation.textContent=message.interactiveInput===true?'Заповни наперед або вводь відповіді під час виконання.':'Задай по одному рядку на кожен виклик input().';
      renderPackages();renderGuide();
      setState('ready',typeof message.version==='string'?'Python '+message.version.slice(0,30)+' · готово':'Готово до запуску');
      return;
    }
    if(message.type==='status'&&typeof message.message==='string'){status.textContent=message.message.slice(0,200);return;}
    if(message.type==='output'){appendOutput(message.text);return;}
    if(message.type==='input'){
      const prompt=typeof message.prompt==='string'?message.prompt.slice(0,300):'Введи значення';
      inputLabel.firstChild.textContent=prompt||'Введи значення';
      setState('input','Очікуємо введення…');inputForm.hidden=false;show('result');
      return;
    }
    if(message.type==='tk'&&message.model&&typeof message.model==='object'){
      const visible=Array.isArray(message.model.windows)&&message.model.windows.length>0||!!message.model.dialog;
      if(visible&&!session)show('tk');
      session=visible;tk.update(message.model);tkIntro.hidden=visible;
      stopButton.disabled=!session&&!['running','input'].includes(state);
      return;
    }
    if(message.type==='done'){
      session=message.interactive===true;
      inputForm.hidden=true;
      setState('ready',session?'Вікно відкрите':message.ok?'Виконано':'Помилка у програмі');
      if(!message.ok)show('result');
      return;
    }
    if(message.type==='error'){
      const error=typeof message.message==='string'?message.message:'Не вдалося виконати програму.';
      inputForm.hidden=true;session=false;tk.clear();tkIntro.hidden=false;
      appendOutput(error+'\n');show('result');
      setState(message.fatal===false?'ready':'error',error.slice(0,140));
    }
  }
  const runner=createRunner(receive);
  function run(){
    if(state==='error'){runner.start();return;}
    if(state!=='ready'||opening)return;
    const main=project.files.find(file=>file.name===project.entry);
    editor.blur();
    clearOutput();tk.clear();tkIntro.hidden=false;session=false;inputForm.hidden=true;show('result');
    setState('running','Виконуємо '+main.name+'…');
    runner.send({type:'run',code:main.text,name:main.name,files:project.files.filter(file=>file!==main),
      stdin:project.input?project.input.split('\n'):[]});
  }
  function stop(){
    tk.clear();tkIntro.hidden=false;session=false;inputForm.hidden=true;
    appendOutput('\nВиконання зупинено.\n');show('result');
    runner.restart();
  }

  async function loadDocument(create){
    if(opening||disposed)return;
    opening=true;runButton.disabled=true;
    try{
      await autosave.flush();
      const {next,title,stored}=await create();
      if(disposed)return;
      if(session||state==='running'||state==='input')stop();
      project=next;record=stored;name.value=cleanProjectName(title);stdin.value=project.input;positions.clear();
      const saved=stored&&resume?.position;
      const first=project.files.some(file=>file.name===saved?.file)?saved.file:project.entry;
      active=first;openFile(first,saved);renderPackages();clearOutput();show('code');
      if(record)rememberWork?.(record,{position:getPosition()});
      else autosave.change();
    }catch(error){if(!disposed)notify(storageError(error));}
    finally{opening=false;if(!disposed)runButton.disabled=['boot','running','input'].includes(state);}
  }

  function renderPackages(){
    packageList.replaceChildren(...runtimePackages.map(key=>{
      const [label,statement]=libraries[key];
      return button(el('span',{},el('strong',{},label),el('code',{},statement)),()=>{
        if(!isScript(active))openFile(project.entry);
        show('code');
        const cursor=editor.selectionStart, start=cursor>0?editor.value.lastIndexOf('\n',cursor-1)+1:0;
        const indent=editor.value.slice(start).match(/^[ \t]*/)[0];
        editor.setSelectionRange(start,start);
        replaceSelection(indent+statement+'\n');
      },{'aria-label':'Вставити '+statement});
    }));
    if(!runtimePackages.length)packageList.append(el('p',{className:'python-note'},'Стандартні модулі доступні через import.'));
  }
  function renderGuide(){
    const key=runtimePackages.join(',');
    if(key===guideKey)return;
    guideKey=key;
    guidePane.replaceChildren(createGuide({packages:runtimePackages,
      onExample:example=>loadDocument(()=>({next:blankProject(example),title:example.title}))}));
  }
  const projectInput=el('input',{type:'file',hidden:true,accept:'.py,.python.json',onChange:event=>{
    const [file]=event.target.files;event.target.value='';
    if(file)loadDocument(async()=>({next:await readProject(file,file.name),title:file.name}));
  }});
  const fileInput=el('input',{type:'file',hidden:true,multiple:true,accept:'.py,.txt,.csv,.json','aria-label':'Додати файли',onChange:async event=>{
    const additions=[...event.target.files];event.target.value='';
    const target=project;
    for(const file of additions){
      try{
        if(file.size>600000)throw new Error('Файл завеликий: '+file.name);
        const text=(await file.text()).replace(/^\uFEFF/,'');
        if(target!==project||disposed)return;
        openFile(addProjectFile(project,file.name,text));autosave.change();show('code');
      }catch(error){notify(error.message);}
    }
  }});

  function fileDialog(rename){
    if(dialog?.open)return;
    const previous=active,input=el('input',{maxlength:80,value:rename?active:'модуль.py','aria-label':'Назва файла',required:true});
    const error=el('p',{className:'python-note',role:'alert'});
    const form=el('form',{onSubmit:event=>{
      event.preventDefault();
      try{
        if(rename){
          const next=checkFilename(input.value,project,previous);
          if(previous===project.entry&&!isScript(next))throw new Error('Головний файл має мати розширення .py.');
          const position=getPosition();
          activeFile().name=next;
          if(project.entry===previous)project.entry=next;
          positions.delete(previous);active=next;
          openFile(next,position);
        }else openFile(addProjectFile(project,input.value));
        autosave.change();dialog.close();show('code');
      }catch(failure){error.textContent=failure.message;}
    }},el('h2',{},rename?'Перейменувати файл':'Новий файл'),input,error,
      el('div',{className:'python-dialog-actions'},button('Скасувати',()=>dialog.close()),el('button',{className:'primary',type:'submit'},'Готово')));
    dialog=el('dialog',{className:'python-dialog'},form);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    host.append(dialog);dialog.showModal();input.focus();input.select();
  }

  const mainFile=button('Зробити головним',()=>{project.entry=active;renderFiles();autosave.change();});
  const removeFile=button('Видалити файл',()=>{
    if(active===project.entry||!confirm('Видалити «'+active+'» з проєкту?'))return;
    project.files=project.files.filter(file=>file.name!==active);positions.delete(active);active=project.entry;
    openFile(active);autosave.change();
  });
  const exportPy=button('Завантажити .py',()=>download(scriptBlob(activeFile().text),active));
  const fileMenu=el('details',{className:'python-menu'},el('summary',{'aria-label':'Файл'},'Файл'),
    el('div',{className:'python-menu-body'},
      button('Новий проєкт',()=>loadDocument(()=>({next:blankProject(),title:'Моя програма'}))),
      button('Відкрити проєкт або .py',()=>projectInput.click()),
      button('Новий файл',()=>fileDialog(false)),button('Додати файли…',()=>fileInput.click()),
      button('Перейменувати файл',()=>fileDialog(true)),mainFile,removeFile,exportPy,
      button('Завантажити проєкт',()=>{try{download(projectBlob(project),cleanProjectName(name.value)+projectExtension);}catch(error){notify(error.message);}}),
      el('details',{className:'python-library-menu'},el('summary',{},'Бібліотеки'),packageList)));
  fileMenu.addEventListener('click',event=>{if(event.target.closest('button'))fileMenu.open=false;});
  const saveButton=icon('✓','Зберегти',()=>{
    if(!record&&!autosave.dirty())autosave.change();
    autosave.flush().catch(error=>notify(storageError(error)));
  },{className:'python-save'});
  const runButton=button('▶ Запустити',run,{className:'primary',disabled:true});
  const stopButton=icon('■','Зупинити',stop,{className:'python-stop',disabled:true});
  const top=el('header',{className:'python-top'},el('a',{href:'#catalog',className:'button','aria-label':'До каталогу'},'←'),
    name,saveButton,fileMenu,guideFor(fileId),projectInput,fileInput);
  const execution=el('div',{className:'python-execution'},runButton,stopButton,status);
  const code=el('section',{className:'python-code','aria-label':'Редактор коду'},files,
    el('div',{className:'python-code-area'},gutter,el('div',{className:'python-code-surface'},ink,editor)),keyboard);
  host.append(top,execution,el('div',{className:'python-main'},code,el('div',{className:'python-side'},result,tkPane,guidePane)),nav);
  root.append(host);document.body.classList.add('python-focus-mode');
  function viewport(){host.style.setProperty('--python-height',(window.visualViewport?.height||innerHeight)+'px');}
  viewport();
  window.addEventListener('resize',viewport);
  window.visualViewport?.addEventListener('resize',viewport);
  host.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.key==='Enter'){event.preventDefault();run();}
    if(event.key.toLowerCase()==='s'){event.preventDefault();saveButton.click();}
  });

  const beforeUnload=event=>{if(autosave.dirty()){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  openFile(active);renderPackages();renderGuide();show('code');runner.start();
  if(fileId)loading=loadDocument(async()=>{
    const file=await filesystem.getFile(fileId);
    if(!file)throw new Error('Файл уже видалено.');
    const native=file.name.toLowerCase().endsWith(projectExtension);
    return {next:await readProject(file.blob,file.name),title:file.name,stored:native?file:undefined};
  });

  return {
    getResumePosition(id){if(record?.id===id)return getPosition();},
    async canLeave(){
      await loading;
      if(opening)return false;
      try{await autosave.flush();return true;}
      catch{return confirm('Не вдалося зберегти проєкт. Вийти без останніх змін?');}
    },
    dispose(){
      disposed=true;runner.dispose(!session&&['ready','boot'].includes(state));autosave.dispose();dialog?.close();
      cancelAnimationFrame(renderFrame);cancelAnimationFrame(outputFrame);
      window.removeEventListener('beforeunload',beforeUnload);
      window.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('resize',viewport);
      document.body.classList.remove('python-focus-mode');
    }
  };
}
