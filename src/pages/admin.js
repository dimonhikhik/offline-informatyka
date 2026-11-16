import { el,download,notify } from '../components/ui.js';
import { baseTasks } from '../practice/catalog.js';
import { instructionView } from '../practice/guide.js';
import { getContent,setContent } from '../core/content/index.js';
import { validateContent,editorTypes,attachmentTypes } from '../core/content/schema.js';
import { artStyle,menuArt } from './catalog-art.js';

const grades=[4,5,6,7,8,9];
const stageNames=['Основне','Інструкція','Матеріали','Публікація'];
const key=task=>task.grade+':'+task.id;
const button=(label,action,attrs={})=>el('button',{type:'button',onClick:action,...attrs},label);
const maxAttachment=5*1024*1024;
const maxImport=28*1024*1024;
const maxSteps=100;
const maxMaterials=10;
const imageAccept='.png,.jpg,.jpeg,.webp';
const fileAccept=Object.keys(attachmentTypes).map(ext=>'.'+ext).join(',');

function taskId(){
  return 'teacher-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
}

function editable(task){
  const instructions=task.instructions??[...instructionView(task).querySelectorAll('ol>li')].map(li=>li.textContent);
  return {id:task.id,grade:task.grade,moduleId:task.moduleId,title:task.title,subtitle:task.subtitle||'',
    difficulty:task.difficulty||'',duration:task.duration||'',folder:task.folder||'',result:task.result||'',
    published:task.published!==false,keepMaterials:task.keepMaterials!==false,
    instructions:[...instructions],attachments:[...(task.attachments||[])]};
}

function simpleTask(task){
  return validateContent({version:1,texts:{},tasks:[task]}).tasks[0];
}

function art(moduleId){
  const icon=Object.hasOwn(menuArt,moduleId)?moduleId:'files';
  return el('span',{className:'admin-task-art','aria-hidden':'true'},
    el('span',{className:'admin-task-art-image',style:artStyle(icon)}));
}

function readMaterial(file){
  const extension=file.name.split('.').pop().toLowerCase();
  const mime=Object.hasOwn(attachmentTypes,extension)&&attachmentTypes[extension];
  if(!mime||file.name.length>180||/[\\/\x00-\x1f]/.test(file.name)||file.size>maxAttachment){
    throw new Error('Перевір тип і розмір файла «'+file.name+'». Межа — 5 МБ.');
  }
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const data='data:'+mime+';base64,'+String(reader.result).split(',')[1];
      if(!mime.startsWith('image/')){resolve({name:file.name,type:mime,data});return;}
      const preview=new Image();
      preview.onload=()=>resolve({name:file.name,type:mime,data});
      preview.onerror=()=>reject(new Error('Не вдалося відкрити зображення «'+file.name+'».'));
      preview.src=data;
    };
    reader.onerror=()=>reject(new Error('Не вдалося прочитати «'+file.name+'».'));
    reader.readAsDataURL(file);
  });
}

export function mount(root){
  let saved=getContent(),token,active,busy=false,disposed=false,filterGrade='',query='',preview;
  const host=el('section',{className:'admin-page'});
  const status=el('p',{className:'admin-status',role:'status'},'Перевіряємо доступ…');
  const newButton=button('+ Додати практичну',newTask,{className:'primary'});
  const tools=el('div',{className:'admin-toolbar'});
  const controls=el('div',{className:'admin-controls'});
  const body=el('div',{className:'admin-body admin-tasks-layout'});
  const list=el('div',{className:'admin-task-list'});
  const wizard=el('div',{className:'admin-task-editor',hidden:true});
  const listPanel=el('section',{className:'admin-task-sidebar','aria-label':'Список практичних робіт'});
  const selectGrade=el('select',{'aria-label':'Фільтр за класом',onChange:e=>{filterGrade=e.target.value;renderList();}},
    el('option',{value:''},'Усі класи'),...grades.map(grade=>el('option',{value:grade},grade+' клас')));
  const search=el('input',{type:'search',placeholder:'Пошук робіт','aria-label':'Пошук практичних робіт',onInput:e=>{
    query=e.target.value.trim().toLocaleLowerCase('uk');renderList();
  }});
  const filters=el('div',{className:'admin-filters'},selectGrade,search);
  listPanel.append(filters,list);
  body.append(listPanel,wizard);
  controls.append(tools,status,body);
  host.append(el('h1',{},'Панель учителя'),controls);
  root.append(host);
  tools.hidden=body.hidden=true;
  const dropdown='.admin-card-menu[open],.admin-backups[open]';
  host.addEventListener('toggle',event=>{
    if(!event.target.matches(dropdown))return;
    for(const menu of host.querySelectorAll(dropdown)){
      if(menu!==event.target)menu.open=false;
    }
  },true);
  host.addEventListener('pointerdown',event=>{
    for(const menu of host.querySelectorAll(dropdown)){
      if(!menu.contains(event.target))menu.open=false;
    }
  });
  host.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const menu=host.querySelector(dropdown);
    if(menu){menu.open=false;menu.querySelector('summary').focus();}
  });

  async function request(url,options={}){
    const response=await fetch(url,{cache:'no-store',...options});
    const data=await response.json().catch(()=>({error:'Перезапусти локальний сервер, щоб відкрити панель учителя.'}));
    if(!response.ok)throw new Error(data.error||'Запит не виконано.');
    return data;
  }

  const dirty=()=>active?.dirty===true;
  const canSwitch=()=>!dirty()||confirm('Відкинути незбережені зміни цієї роботи?');

  async function run(action){
    if(busy||disposed)return;
    busy=true;
    tools.inert=body.inert=true;
    try{await action();}
    catch(error){if(!disposed){status.textContent=error.message;notify(error.message);}}
    finally{busy=false;tools.inert=body.inert=false;}
  }

  async function saveTasks(tasks,message){
    const payload=validateContent({...saved,tasks});
    status.textContent='Зберігаємо практичні роботи…';
    const result=await request('/api/admin/content',{
      method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':token},body:JSON.stringify(payload)
    });
    if(disposed)return false;
    saved=validateContent(result);
    setContent(saved);
    status.textContent=message;
    notify(message);
    return true;
  }

  function allWorks(){
    const edited=new Map(saved.tasks.map(task=>[key(task),task]));
    const works=baseTasks.map(base=>{
      const override=edited.get(key(base));
      edited.delete(key(base));
      return override?{...base,...override,moduleId:base.moduleId}:base;
    });
    return [...works,...edited.values()].sort((a,b)=>a.grade-b.grade||a.title.localeCompare(b.title,'uk'));
  }

  function renderList(){
    const works=allWorks().filter(task=>(!filterGrade||task.grade===Number(filterGrade))&&task.title.toLocaleLowerCase('uk').includes(query));
    list.replaceChildren(...works.map(task=>{
      const current=key(task)===active?.original;
      const title=el('span',{className:'admin-task-line'},el('strong',{},task.title),
        el('small',{},task.grade+' клас · '+editorTypes[task.moduleId]));
      const entry=button(el('span',{className:'admin-task-entry-content'},art(task.moduleId),title),()=>openTask(task),
        {className:'admin-task-entry','aria-current':current?'true':null});
      const visibility=el('span',{className:'admin-visibility'+(task.published===false?' is-hidden':'')},
        task.published===false?'Приховано':'Видно учням');
      const menu=el('details',{className:'admin-card-menu'},el('summary',{'aria-label':'Дії з роботою «'+task.title+'»'},'⋯'),
        el('div',{className:'admin-card-actions'},
          button('Створити копію',()=>{menu.open=false;copyTask(task);}),
          button(task.published===false?'Показати учням':'Приховати',()=>{menu.open=false;changeVisibility(task);}),
          saved.tasks.some(item=>key(item)===key(task))?button(
            baseTasks.some(item=>key(item)===key(task))?'Повернути стандартну':'Видалити',
            ()=>{menu.open=false;removeTask(task);},{className:'admin-remove'}):null));
      return el('article',{className:'admin-task-card'},entry,el('div',{className:'admin-task-meta'},visibility,menu));
    }));
    if(!works.length)list.append(el('p',{className:'admin-list-empty'},'За цим запитом нічого не знайдено.'));
  }

  function clearWizard(){
    active=undefined;
    wizard.hidden=true;
    body.classList.remove('has-wizard');
    wizard.replaceChildren();
    renderList();
  }

  function newTask(){
    if(!canSwitch())return;
    openWizard({id:taskId(),grade:Number(filterGrade)||6,moduleId:'word',title:'',subtitle:'',
      difficulty:'',duration:'',folder:'',result:'',instructions:[''],attachments:[],published:true,keepMaterials:false});
  }

  function openTask(task){
    if(key(task)===active?.original||!canSwitch())return;
    openWizard(editable(task),key(task));
  }

  function copyTask(task){
    if(!canSwitch())return;
    openWizard({...editable(task),id:taskId(),title:(task.title.slice(0,149)+' — копія'),keepMaterials:false});
  }

  function changeVisibility(task){
    if(!canSwitch())return;
    return run(async()=>{
      const updated=simpleTask({...editable(task),published:task.published===false});
      const tasks=[...saved.tasks.filter(item=>key(item)!==key(task)),updated];
      if(await saveTasks(tasks,updated.published?'Учні бачать роботу після оновлення сторінки.':'Роботу приховано.'))clearWizard();
    });
  }

  function removeTask(task){
    if(!canSwitch())return;
    const restored=baseTasks.some(item=>key(item)===key(task));
    if(!confirm(restored?'Повернути стандартну версію цієї роботи?':'Видалити практичну роботу зі списку?'))return;
    return run(async()=>{
      const tasks=saved.tasks.filter(item=>key(item)!==key(task));
      if(await saveTasks(tasks,restored?'Стандартну роботу відновлено.':'Роботу видалено.'))clearWizard();
    });
  }

  function showPreview(task){
    const next=simpleTask({...task,published:false});
    const base=baseTasks.find(item=>key(item)===key(next));
    const shown={...base,...next};
    preview?.close();
    const dialog=el('dialog',{className:'practice-instruction-dialog admin-preview','aria-label':'Перегляд інструкції'},
      el('div',{className:'admin-preview-bar'},button('Закрити',()=>dialog.close())),instructionView(shown));
    preview=dialog;
    dialog.addEventListener('close',()=>{dialog.remove();if(preview===dialog)preview=undefined;});
    host.append(dialog);
    dialog.showModal();
  }

  function openWizard(task,original){
    active={task,original,dirty:false};
    const session=active;
    const builtin=baseTasks.some(item=>key(item)===original);
    let stage=0,maxStage=0,firstField;
    const progress=el('ol',{className:'admin-progress','aria-label':'Кроки створення роботи'});
    const panel=el('div',{className:'admin-stage'});
    const navigation=el('div',{className:'admin-stage-actions'});
    const error=el('p',{className:'admin-error',role:'alert'});
    const context=el('p',{className:'admin-wizard-context'});
    const backToList=button('← До списку',()=>{
      if(canSwitch()){clearWizard();status.textContent='Практичні роботи';newButton.focus();}
    },{className:'admin-back'});
    wizard.hidden=false;
    body.classList.add('has-wizard');
    wizard.replaceChildren(el('header',{className:'admin-wizard-header'},backToList,context),progress,panel,error,navigation);
    renderList();

    function changed(){
      session.dirty=true;
      error.textContent='';
      status.textContent='Є незбережені зміни.';
    }

    function textField(name,label,max,attrs={},multi=false){
      const input=el(multi?'textarea':'input',{maxlength:max,...attrs,onInput:event=>{
        task[name]=event.target.value;changed();
      }});
      input.value=task[name]||'';
      if(name==='title')firstField=input;
      return el('label',{},label,input);
    }

    function selectField(name,label,options,onChange){
      const input=el('select',{disabled:builtin,onChange:event=>{
        task[name]=name==='grade'?Number(event.target.value):event.target.value;
        changed();onChange?.();
      }},...options.map(([value,title])=>el('option',{value},title)));
      input.value=String(task[name]);
      return el('label',{},label,input);
    }

    function basics(){
      const folder=textField('folder','Робоча папка',100);
      folder.hidden=task.moduleId!=='windows';
      const grade=selectField('grade','Клас',grades.map(value=>[value,value+' клас']));
      const program=selectField('moduleId','Програма',Object.entries(editorTypes),()=>{folder.hidden=task.moduleId!=='windows';});
      return el('div',{className:'admin-fields'},textField('title','Назва роботи',160,{placeholder:'Наприклад, Форматування документа',required:true}),
        el('div',{className:'admin-field-grid'},grade,program),
        el('details',{className:'admin-optional'},el('summary',{},'Додаткові відомості'),
          textField('subtitle','Короткий опис',1000,{rows:2},true),
          el('div',{className:'admin-field-grid'},textField('duration','Час',60,{placeholder:'Наприклад, 25 хв'}),textField('difficulty','Складність',60)),folder));
    }

    function instruction(){
      const entries=el('ol',{className:'admin-steps'});
      const add=button('+ Додати пункт',()=>{
        if(task.instructions.length>=maxSteps)return;
        task.instructions.push('');
        changed();paint();
        entries.lastElementChild.querySelector('textarea').focus();
      });
      function paint(){
        if(!task.instructions.length)task.instructions.push('');
        add.disabled=task.instructions.length>=maxSteps;
        entries.replaceChildren(...task.instructions.map((line,index)=>{
          const input=el('textarea',{rows:3,maxlength:6000,'aria-label':'Пункт '+(index+1),
            placeholder:'Запиши, що має зробити учень',onInput:event=>{task.instructions[index]=event.target.value;changed();}});
          input.value=line;
          const move=offset=>{
            const target=index+offset;
            [task.instructions[index],task.instructions[target]]=[task.instructions[target],task.instructions[index]];
            changed();paint();
            entries.children[target].querySelector('textarea').focus();
          };
          return el('li',{className:'admin-step'},
            el('span',{className:'admin-step-number','aria-hidden':'true'},String(index+1)),input,
            el('div',{className:'admin-step-tools'},
              button('↑',()=>move(-1),{disabled:index===0,'aria-label':'Пункт '+(index+1)+' вище'}),
              button('↓',()=>move(1),{disabled:index===task.instructions.length-1,'aria-label':'Пункт '+(index+1)+' нижче'}),
              button('×',()=>{task.instructions.splice(index,1);changed();paint();},
                {'aria-label':'Вилучити пункт '+(index+1)})));
        }));
      }
      paint();
      return el('div',{className:'admin-fields'},entries,add,
        el('details',{className:'admin-optional'},el('summary',{},'Очікуваний результат'),
          textField('result','Що має вийти',4000,{rows:3},true)));
    }

    function materials(){
      const gallery=el('div',{className:'admin-materials'});
      const count=el('p',{className:'admin-material-count'});
      const inputs=[];
      function picker(accept,label){
        const input=el('input',{type:'file',multiple:true,accept,hidden:true,onChange:async event=>{
          const selected=[...event.target.files];event.target.value='';
          if(!selected.length)return;
          if(task.attachments.length+selected.length>maxMaterials){error.textContent='До 10 матеріалів на одну роботу.';return;}
          await run(async()=>{
            error.textContent='';
            const previousStatus=status.textContent;
            status.textContent='Читаємо матеріали…';
            const additions=[];
            try{
              for(const file of selected)additions.push(await readMaterial(file));
            }catch(problem){error.textContent=problem.message;status.textContent=previousStatus;return;}
            if(disposed||active!==session)return;
            task.attachments.push(...additions);
            changed();paint();
          });
        }});
        const control=button(label,()=>input.click());
        inputs.push(control);
        return [control,input];
      }
      function paint(){
        count.textContent=task.attachments.length+' / '+maxMaterials+' файлів · до 5 МБ кожен';
        for(const control of inputs)control.disabled=task.attachments.length>=maxMaterials;
        gallery.replaceChildren(...task.attachments.map((material,index)=>{
          const image=material.type.startsWith('image/');
          const visual=image?el('img',{src:material.data,alt:material.name,loading:'lazy',decoding:'async'}):
            el('span',{className:'admin-file-glyph','aria-hidden':'true'},material.name.split('.').pop().toUpperCase());
          return el('article',{className:'admin-material'},el('div',{className:'admin-material-visual'},visual),
            el('div',{className:'admin-material-meta'},el('span',{},material.name),
              button('×',()=>{task.attachments.splice(index,1);changed();paint();},
                {'aria-label':'Вилучити «'+material.name+'»',title:'Вилучити'})));
        }));
      }
      const imagePicker=picker(imageAccept,'+ Зображення');
      const filesPicker=picker(fileAccept,'+ Файли');
      const keep=el('input',{type:'checkbox',checked:task.keepMaterials,onChange:event=>{
        task.keepMaterials=event.target.checked;changed();
      }});
      paint();
      return el('div',{className:'admin-fields'},el('div',{className:'admin-pickers'},...imagePicker,...filesPicker),
        count,gallery,builtin?el('label',{className:'admin-check'},keep,'Залишити стандартні зразки й заготовки'):null);
    }

    function publication(){
      const checked=el('input',{type:'checkbox',checked:task.published,onChange:event=>{
        task.published=event.target.checked;changed();paintNavigation();
      }});
      const items=task.instructions.filter(value=>value.trim()).length;
      return el('div',{className:'admin-fields'},
        el('div',{className:'admin-recap'},art(task.moduleId),el('div',{},el('strong',{},task.title),
          el('p',{},task.grade+' клас · '+editorTypes[task.moduleId]),
          el('p',{},'Пунктів: '+items+' · файлів: '+task.attachments.length))),
        el('label',{className:'admin-check'},checked,'Показати роботу учням'),
        button('Переглянути інструкцію',()=>{
          try{showPreview(task);}catch(problem){error.textContent=problem.message;}
        },{className:'admin-preview-button'}));
    }

    function save(){
      if(!task.title.trim()){stepTo(0);error.textContent='Введи назву роботи.';firstField.focus();return;}
      if(task.published&&!task.instructions.some(value=>value.trim())){
        stepTo(1);error.textContent='Додай хоча б один пункт інструкції.';panel.querySelector('textarea').focus();return;
      }
      return run(async()=>{
        let next;
        try{next=simpleTask(task);}catch(problem){error.textContent=problem.message;return;}
        const id=key(next);
        if(id!==original&&allWorks().some(item=>key(item)===id)){
          error.textContent='У цьому класі вже є робота з таким ідентифікатором.';return;
        }
        const items=[...saved.tasks.filter(item=>key(item)!==original&&key(item)!==id),next];
        if(await saveTasks(items,next.published?'Роботу збережено. Учням потрібно оновити сторінку.':'Приховану роботу збережено.')){
          if(filterGrade&&filterGrade!==String(next.grade)){filterGrade=String(next.grade);selectGrade.value=filterGrade;}
          if(query&&!next.title.toLocaleLowerCase('uk').includes(query)){query='';search.value='';}
          clearWizard();newButton.focus();
        }
      });
    }

    function paintNavigation(){
      navigation.replaceChildren(stage>0?button('← Назад',()=>stepTo(stage-1)):null,
        stage<stageNames.length-1?button('Далі →',()=>stepTo(stage+1),{className:'primary'}):
          button(task.published?'Опублікувати':'Зберегти приховану',save,{className:'primary'}));
    }

    function stepTo(target,moveFocus=true){
      if(target>stage&&!task.title.trim()){
        if(stage!==0)stepTo(0,false);
        error.textContent='Введи назву роботи.';firstField.focus();return;
      }
      stage=target;
      maxStage=Math.max(maxStage,stage);
      progress.replaceChildren(...stageNames.map((label,index)=>el('li',{},
        button(el('span',{className:'admin-progress-label'},el('b',{'aria-hidden':'true'},String(index+1)),label),
          ()=>stepTo(index),{'aria-current':stage===index?'step':null,'data-complete':index<stage,disabled:index>maxStage}))));
      context.textContent=(original?'Редагування роботи':'Нова практична робота')+' · '+(stage+1)+' із '+stageNames.length;
      const title=el('h2',{tabindex:-1},stageNames[stage]);
      panel.replaceChildren(title,[basics,instruction,materials,publication][stage]());
      error.textContent='';
      paintNavigation();
      if(moveFocus){panel.scrollIntoView({block:'nearest'});title.focus({preventScroll:true});}
    }

    stepTo(0);
  }

  function exportBackup(){
    return run(async()=>{
      let tasks=saved.tasks;
      if(dirty()){
        const current=simpleTask({...active.task,published:active.task.published&&active.task.instructions.some(value=>value.trim())});
        tasks=[...tasks.filter(item=>key(item)!==active.original&&key(item)!==key(current)),current];
      }
      const content=validateContent({version:1,revision:saved.revision,texts:{},tasks});
      download(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}),'Практичні-роботи.json');
    });
  }

  const importInput=el('input',{type:'file',accept:'.json,application/json',hidden:true,onChange:event=>{
    const file=event.target.files[0];event.target.value='';
    if(!file)return;
    run(async()=>{
      if(file.size>maxImport)throw new Error('Резервна копія має бути до 28 МБ.');
      const data=JSON.parse(await file.text());
      const contents=validateContent({...data,texts:{}});
      if(!confirm('Замінити додані роботи та зміни стандартних робіт цією копією?'))return;
      if(await saveTasks(contents.tasks,'Практичні роботи відновлено з копії.'))clearWizard();
    });
  }});
  const copies=el('details',{className:'admin-backups'},el('summary',{},'Копії'),
    el('div',{className:'admin-backup-actions'},button('Завантажити копію робіт',exportBackup),
      button('Відновити з копії…',()=>importInput.click()),
      button('Оновити із сервера',()=>{
        if(!canSwitch())return;
        run(async()=>{
          const contents=validateContent(await request('/api/admin/content'));
          if(disposed)return;
          saved=contents;setContent(saved);clearWizard();status.textContent='Дані оновлено.';
        });
      }),importInput));
  tools.append(newButton,copies);
  tools.addEventListener('click',event=>{
    if(event.target.closest('.admin-backup-actions button'))copies.open=false;
  });

  const before=event=>{if(dirty()){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',before);
  const ready=(async()=>{
    try{
      const session=await request('/api/admin/session');
      const contents=validateContent(await request('/api/admin/content'));
      if(disposed)return;
      token=session.token;saved=contents;setContent(saved);renderList();
      tools.hidden=body.hidden=false;status.textContent='Практичні роботи';
    }catch(error){if(!disposed)status.textContent=error.message;}
  })();

  return {
    async canLeave(){
      await ready;
      if(busy){notify('Дочекайся завершення операції.');return false;}
      return canSwitch();
    },
    dispose(){disposed=true;preview?.close();window.removeEventListener('beforeunload',before);}
  };
}
