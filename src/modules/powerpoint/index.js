import { office,el,button,cleanName,clamp } from '../office/shared.js';
import { blank,read,slide,object,imageData,toPptx,safeLink,SLIDE_ASPECTS,SLIDE_FONTS,SLIDE_LAYOUTS,SLIDE_THEMES,
  ANIMATION_EFFECTS,ANIMATION_TRIGGERS,animationFor,orderedAnimations } from './model.js';
import { bindSlideCanvas,objectLabel,renderSlide } from './canvas.js';
import { showSlides } from './show.js';
import { printSlides } from './print.js';
import { bindFilmReorder } from './film-reorder.js';

const slideLimit=50,objectLimit=50,maxProjectBytes=18*1024*1024;
const shapeLabels={rect:'Прямокутник',roundRect:'Заокруглений',ellipse:'Еліпс',triangle:'Трикутник',diamond:'Ромб',arrow:'Стрілка',line:'Лінія',star:'Зірка'};
const transitions=[['none','Без переходу'],['fade','Згасання'],['push','Зсув'],['wipe','Витирання']];
const panelLabels={slides:'Слайди',insert:'Вставити',design:'Оформлення',show:'Показ',object:'Властивості об’єкта',layers:'Шари',animation:'Анімації об’єктів'};
const field=(label,control)=>el('label',{className:'ppt-field'},el('span',{},label),control);
const select=(value,options,onChange)=>el('select',{onChange:event=>onChange(event.target.value)},
  ...options.map(([id,label])=>el('option',{value:id,selected:String(id)===String(value)},label)));
const number=(value,min,max,onChange,step=1)=>el('input',{type:'number',min,max,step,value,onChange:event=>onChange(clamp(event.target.value,min,max))});
const color=(value,onChange)=>el('input',{type:'color',value,onChange:event=>onChange(event.target.value)});
const pressed=(label,value,onClick)=>button(label,onClick,{'aria-pressed':String(Boolean(value))});
const section=(title,...children)=>el('section',{className:'ppt-section'},el('h3',{},title),...children);
const commands=(...children)=>el('div',{className:'ppt-commands'},...children);

export function mount(root,context){
  const app=office(root,context,{id:'powerpoint',label:'Презентації',blank,read,ext:'.slides.json',accept:'.slides.json,.pptx'});
  let active=0,selected=-1,opened=null,inspector='style',clipboard=null,snap=true,themeScope='deck',layerSelection=new Set(),closeShow;
  const dialogs=new Set(),thumbnails=new Map(),panelButtons=new Map();
  let filmOrder=[],pendingImageSlide=null,revealResume=false;
  const current=()=>app.state.slides[active];
  const item=()=>current().objects[selected];
  const aspect=()=>app.state.aspect||'wide';

  const film=el('div',{className:'slide-film',role:'list','aria-label':'Мініатюри слайдів'});
  const filmStatus=el('span',{className:'ppt-film-status',role:'status'});
  const filmInstructions=el('span',{className:'ppt-film-status',id:'ppt-film-instructions'},
    'Перетягни ручку або натисни клавішу зі стрілкою, щоб перемістити слайд.');
  const filmRow=el('div',{className:'ppt-film-row'},film,
    button('+',event=>togglePanel('slides',event.currentTarget,event.detail===0),{className:'ppt-new-slide','aria-label':'Додати слайд','aria-controls':'ppt-drawer','aria-keyshortcuts':'Control+M Meta+M'}));
  const canvas=el('div',{className:'slide-canvas ppt-editor-canvas',tabindex:0,'aria-label':'Полотно поточного слайда'});
  const workspace=el('div',{className:'slide-workspace ppt-workspace'},canvas);
  const contextBar=el('div',{className:'ppt-context',hidden:true});
  const panelTitle=el('strong',{id:'ppt-drawer-title',tabindex:-1});
  const panelBody=el('div',{className:'ppt-drawer-content'});
  const drawer=el('section',{id:'ppt-drawer',className:'ppt-drawer','aria-labelledby':'ppt-drawer-title',hidden:true},
    el('div',{className:'ppt-drawer-heading'},panelTitle,button('✕',()=>closePanel(true),{'aria-label':'Закрити інструменти'})),panelBody);
  app.body.append(filmRow,workspace,contextBar,filmStatus,filmInstructions);
  const importNote=button('Деталі імпорту',showImportWarnings,{className:'ppt-import-note',hidden:true});
  app.tools.classList.add('ppt-dock');
  app.tools.setAttribute('role','group');
  app.tools.setAttribute('aria-label','Інструменти презентації');
  let panelOpener=null;
  for(const [key,glyph] of [['slides','▣'],['insert','＋'],['design','◐'],['show','▷']]){
    const tab=button('',event=>togglePanel(key,event.currentTarget,event.detail===0),{'aria-controls':'ppt-drawer','aria-expanded':'false',
      'aria-keyshortcuts':key==='show'?'F5 Shift+F5':null});
    tab.append(el('span',{className:'ppt-dock-icon','aria-hidden':'true'},glyph),el('span',{},panelLabels[key]));
    panelButtons.set(key,tab);
    app.tools.append(tab);
  }
  app.menu.querySelector(':scope > div').append(
    button('Експорт PowerPoint (.pptx)',exportPptx),
    button('Друк / PDF',()=>app.run(()=>printSlides(app.state))),importNote);

  function hasRoom(extras=0){
    if(new Blob([JSON.stringify(app.state)]).size+extras<=maxProjectBytes)return true;
    app.notify('Проєкт завеликий. Зменш кількість або розмір зображень.');
    return false;
  }
  function changeObject(action){
    if(item())app.change(()=>action(item()));
  }
  function changeSlide(action){
    app.change(()=>action(current()));
  }
  function selectSlide(index,reveal=true){
    if(index<0||index>=app.state.slides.length)return;
    active=index;selected=-1;layerSelection.clear();render();
    if(reveal)scrollToSlide();
  }
  function addSlide(layout){
    if(app.state.slides.length>=slideLimit)return app.notify('У презентації може бути до 50 слайдів.');
    app.change(()=>{
      app.state.slides.splice(active+1,0,slide(layout,app.state.theme));
      active++;selected=-1;layerSelection.clear();
    });
    closePanel();scrollToSlide();
  }
  function duplicateSlide(){
    if(app.state.slides.length>=slideLimit)return app.notify('У презентації може бути до 50 слайдів.');
    if(!hasRoom(new Blob([JSON.stringify(current())]).size))return;
    app.change(()=>{
      app.state.slides.splice(active+1,0,structuredClone(current()));
      active++;selected=-1;layerSelection.clear();
    });
    scrollToSlide();
  }
  function reorderSlide(from,to){
    const slides=app.state.slides;
    if(from===to||!slides[from]||!slides[to])return false;
    const editing=current();
    let moved=false;
    app.change(()=>{
      const [moving]=slides.splice(from,1);
      slides.splice(to,0,moving);
      active=slides.indexOf(editing);
      moved=true;
    });
    return moved;
  }
  function moveSlide(to){
    reorderSlide(active,to);
    scrollToSlide();
  }
  function deleteSlide(){
    if(app.state.slides.length<2)return;
    openForm('Видалити слайд?',el('p',{},`Слайд ${active+1} буде вилучено з презентації.`),()=>{
      app.change(()=>{
        app.state.slides.splice(active,1);
        active=Math.min(active,app.state.slides.length-1);selected=-1;layerSelection.clear();
      });
    },'Видалити');
  }
  function addObject(next){
    if(current().objects.length>=objectLimit){app.notify('На слайді може бути до 50 об’єктів.');return false;}
    if(!hasRoom(new Blob([JSON.stringify(next)]).size))return false;
    app.change(()=>{
      const animation=animationFor(next.animation);
      if(animation.effect!=='none'){
        const entries=orderedAnimations(current().objects);
        updateAnimationOrder(entries);
        next.animation={...animation,order:entries.length+1};
      }
      current().objects.push(next);selected=current().objects.length-1;layerSelection.clear();
    });
    closePanel();
    return true;
  }
  function insertShape(type){
    const palette=SLIDE_THEMES[app.state.theme];
    const next=object(type);
    if(palette&&app.state.theme!=='classic'){next.fill=palette.accent;next.stroke=palette.accent;}
    addObject(next);
  }
  function deleteObject(index=selected){
    if(!current().objects[index])return;
    app.change(()=>{
      current().objects.splice(index,1);
      updateAnimationOrder(orderedAnimations(current().objects));
      selected=-1;layerSelection.clear();
    });
  }
  function rollCopy(value){
    const next=structuredClone(value);
    next.x=clamp(next.x+24,0,960-next.w);
    next.y=clamp(next.y+24,0,540-next.h);
    return next;
  }
  function copyObject(){
    if(!item())return;
    clipboard=structuredClone(item());renderPanel();
    app.notify('Об’єкт скопійовано. Його можна вставити на інший слайд.');
  }
  function shiftLayer(to){
    if(!item()||to===selected)return;
    app.change(()=>{
      updateAnimationOrder(orderedAnimations(current().objects));
      const [moving]=current().objects.splice(selected,1);
      current().objects.splice(to,0,moving);selected=to;layerSelection.clear();
    });
  }
  function updateAnimationOrder(entries){
    for(const [index,{object:target}] of entries.entries()){
      if(target.animation?.order!==index+1)target.animation={...animationFor(target.animation),order:index+1};
    }
  }
  function setAnimation(patch){
    const target=item();
    if(!target)return;
    const entries=orderedAnimations(current().objects);
    const next=animationFor({...animationFor(target.animation),...patch});
    app.change(()=>{
      if(next.effect==='none'){
        delete target.animation;
        updateAnimationOrder(entries.filter(entry=>entry.object!==target));
      }else{
        target.animation=next;
        if(!entries.some(entry=>entry.object===target))entries.push({object:target});
        updateAnimationOrder(entries);
      }
    });
  }
  function moveAnimation(index,direction){
    const entries=orderedAnimations(current().objects);
    const to=index+direction;
    if(!entries[index]||!entries[to])return;
    app.change(()=>{
      const [moving]=entries.splice(index,1);
      entries.splice(to,0,moving);
      updateAnimationOrder(entries);
    });
  }

  function openForm(title,content,apply,applyLabel='Готово',focus=null){
    const error=el('p',{className:'ppt-error',role:'alert',hidden:true});
    const form=el('form',{onInput:()=>{error.hidden=true;},onSubmit:event=>{
      event.preventDefault();
      try{if(!apply||apply()!==false)dialog.close();}
      catch(problem){error.hidden=false;error.textContent=problem.message;}
    }},el('div',{className:'ppt-dialog-content'},content,error),
    el('div',{className:'ppt-dialog-actions'},apply?
      [button('Скасувати',()=>dialog.close()),el('button',{type:'submit',className:'ppt-primary'},applyLabel)]:
      button('Закрити',()=>dialog.close(),{className:'ppt-primary'})));
    const dialog=el('dialog',{className:'office-dialog ppt-dialog','aria-label':title},
      el('header',{className:'ppt-dialog-heading'},el('h2',{},title),button('✕',()=>dialog.close(),{'aria-label':'Закрити',autofocus:!focus})),form);
    dialogs.add(dialog);
    dialog.addEventListener('close',()=>{dialogs.delete(dialog);dialog.remove();},{once:true});
    app.host.append(dialog);dialog.showModal();
    if(focus){focus.focus({preventScroll:true});focus.setSelectionRange(focus.value.length,focus.value.length);}
    return dialog;
  }
  function editText(target=item(),fresh=false){
    if(!target||target.type!=='text')return;
    const input=el('textarea',{maxlength:5000,rows:5,'aria-label':'Текст на слайді'},fresh?'':target.text);
    openForm(fresh?'Додати текст':'Редагувати текст',input,()=>{
      if(fresh){
        const palette=SLIDE_THEMES[app.state.theme];
        return addObject({...target,text:input.value,color:palette?.text||target.color});
      }
      app.change(()=>{target.text=input.value;});
    },fresh?'Додати':'Застосувати',input);
  }
  function editTable(target=item(),fresh=false){
    if(!target||target.type!=='table')return;
    let grid=target.cells.map(row=>[...row]);
    const cells=el('div',{className:'ppt-table-scroll'});
    const header=el('input',{type:'checkbox',checked:target.head});
    function resize(rows,columns){
      grid=Array.from({length:rows},(_,row)=>Array.from({length:columns},(_,column)=>grid[row]?.[column]||''));
      buildGrid();
    }
    function buildGrid(){
      cells.replaceChildren(el('table',{},el('tbody',{},...grid.map((row,r)=>el('tr',{},...row.map((value,c)=>
        el('td',{},el('input',{value,maxlength:200,'aria-label':`Рядок ${r+1}, стовпець ${c+1}`,onInput:event=>{grid[r][c]=event.target.value;}}))))))));
    }
    buildGrid();
    const size=el('div',{className:'ppt-field-grid'},
      field('Рядки',select(grid.length,Array.from({length:10},(_,i)=>[i+1,i+1]),value=>resize(Number(value),grid[0].length))),
      field('Стовпці',select(grid[0].length,Array.from({length:8},(_,i)=>[i+1,i+1]),value=>resize(grid.length,Number(value)))),
      el('label',{className:'ppt-check'},header,'Виділити перший рядок'));
    openForm(fresh?'Додати таблицю':'Редагувати таблицю',[size,cells],()=>{
      if(fresh)return addObject({...target,cells:grid,head:header.checked});
      app.change(()=>{target.cells=grid;target.head=header.checked;});
    },fresh?'Додати':'Застосувати');
  }
  function editLink(){
    const target=item();
    if(!target)return;
    const value=el('input',{type:'text',inputmode:'url',placeholder:'https://…',maxlength:2000,value:target.link||''});
    openForm('Гіперпосилання',field('Адреса посилання',value),()=>{
      const raw=value.value.trim(),link=safeLink(raw);
      if(raw&&!link)throw Error('Введи повну адресу з https://, http:// або mailto:.');
      app.change(()=>{target.link=link;});
    });
  }
  function editNotes(){
    const target=current(),input=el('textarea',{maxlength:8000,rows:7,'aria-label':'Нотатки доповідача'},target.notes||'');
    openForm('Нотатки доповідача',input,()=>app.change(()=>{target.notes=input.value;}),'Зберегти');
  }
  function editTitle(){
    const target=current(),input=el('input',{maxlength:120,value:target.title||''});
    openForm('Назва слайда',field('Назва в переліку слайдів',input),()=>app.change(()=>{target.title=input.value.trim();}),'Зберегти',input);
  }
  function showImportWarnings(){
    const warnings=app.state.importWarnings||[];
    openForm('Імпорт PPTX',el('ul',{className:'ppt-import-warnings'},...warnings.map(text=>el('li',{},text))));
  }
  function findText(){
    const query=el('input',{type:'search',maxlength:150,placeholder:'Що знайти'});
    const replacement=el('input',{maxlength:150,placeholder:'Заміна'});
    const results=el('div',{className:'ppt-find-results','aria-live':'polite'});
    function matcher(){
      if(!query.value)return null;
      const literal=[...query.value].map(character=>'\\^$.*+?()[]{}|'.includes(character)?'\\'+character:character).join('');
      return new RegExp(literal,'giu');
    }
    function textFields(){
      return app.state.slides.flatMap((target,slideIndex)=>target.objects.flatMap((o,index)=>{
        if(o.type==='text')return [{slideIndex,index,source:o.text,max:5000,set:value=>{o.text=value;}}];
        if(o.type==='table')return o.cells.flatMap(row=>row.map((source,column)=>
          ({slideIndex,index,source,max:200,set:value=>{row[column]=value;}})));
        return [];
      }));
    }
    function refresh(){
      const pattern=matcher();
      if(!pattern){results.replaceChildren();return;}
      const hits=textFields().filter(entry=>entry.source.search(pattern)>=0);
      results.replaceChildren(el('p',{},hits.length?`Збігів у блоках і комірках: ${hits.length}.`:'Збігів немає.'),
        ...hits.slice(0,60).map(hit=>button(`Слайд ${hit.slideIndex+1} · ${hit.source.trim().slice(0,52)}`,()=>{
          dialog.close();closePanel();selectSlide(hit.slideIndex);selected=hit.index;renderSelection();
        })));
    }
    query.addEventListener('input',refresh);
    const dialog=openForm('Знайти й замінити',
      [el('div',{className:'ppt-field-grid'},field('Знайти',query),field('Замінити на',replacement)),results],()=>{
        const pattern=matcher();
        if(!pattern)throw Error('Введи текст для пошуку.');
        const changes=textFields().flatMap(field=>{
          const value=field.source.replace(pattern,()=>replacement.value);
          return value===field.source?[]:[{...field,value}];
        });
        if(!changes.length)throw Error('Немає тексту, який зміниться після заміни.');
        if(changes.some(change=>change.value.length>change.max))throw Error('Після заміни текст не вміститься в ліміт блока або комірки.');
        if(!hasRoom(changes.reduce((sum,change)=>sum+Math.max(0,change.value.length-change.source.length)*3,0)))return false;
        app.change(()=>{for(const change of changes)change.set(change.value);});
        app.notify(`Змінено текстових блоків або комірок: ${changes.length}.`);
      },'Замінити все',query);
  }
  function editSelected(index=selected){
    selected=index;
    if(item()?.type==='text')editText();
    else if(item()?.type==='table')editTable();
    else if(item())openPanel('object');
  }
  const imageInput=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true,onChange:async event=>{
    const file=event.target.files[0],target=pendingImageSlide;
    pendingImageSlide=null;event.target.value='';
    if(!file)return;
    let prepared;
    await app.run(async()=>{
      const image=await imageData(file);
      if(!app.host.isConnected||!app.state.slides.includes(target))return;
      const width=Math.max(20,Math.min(620,360*image.ratio));
      const height=clamp(width/image.ratio,20,360);
      if(target.objects.length>=objectLimit)throw Error('На слайді може бути до 50 об’єктів.');
      if(!hasRoom(image.src.length+1000))return;
      prepared={target,image,width,height};
    });
    if(!prepared||!app.host.isConnected||!app.state.slides.includes(prepared.target))return;
    active=app.state.slides.indexOf(prepared.target);
    addObject({...object('image'),x:(960-prepared.width)/2,y:(540-prepared.height)/2,
      w:prepared.width,h:prepared.height,src:prepared.image.src,fit:'contain',alt:file.name.slice(0,160)});
    scrollToSlide();
  }});
  app.host.append(imageInput);
  function insertImage(){
    pendingImageSlide=current();
    imageInput.click();
  }
  async function exportPptx(){
    const filename=cleanName(app.state.name)+'.pptx';
    let blob;
    await app.run(async()=>{blob=await toPptx(app.state);});
    if(!blob||!app.host.isConnected)return;
    const url=URL.createObjectURL(blob);
    const dialog=openForm('Експорт PowerPoint',
      el('a',{className:'button ppt-primary',href:url,download:filename},'Завантажити '+filename));
    dialog.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});
  }
  function openShow(deck,index,onClose){
    closeShow?.();
    closeShow=showSlides({host:app.host,deck,startIndex:index,renderSlide,notify:app.notify,onClose:()=>{
      closeShow=null;onClose();
    }});
  }
  function present(index){
    closePanel();
    openShow(app.state,index,()=>canvas.focus({preventScroll:true}));
  }
  function previewAnimations(opener){
    const target={...current(),hidden:false,transition:'none',advance:0,notes:''};
    openShow({...app.state,slides:[target]},0,()=>opener.focus({preventScroll:true}));
  }

  function setTheme(key){
    const palette=SLIDE_THEMES[key];
    app.change(()=>{
      if(themeScope==='deck')app.state.theme=key;
      const slides=themeScope==='deck'?app.state.slides:[current()];
      for(const target of slides){
        target.background=palette.background;
        for(const o of target.objects){
          if(o.type==='text')o.color=palette.text;
          if(shapeLabels[o.type]){o.fill=palette.accent;o.stroke=palette.accent;}
        }
      }
    });
  }
  const panels={
    slides(){
      const layoutCards=Object.entries(SLIDE_LAYOUTS).map(([key,label])=>{
        const sample=el('span',{className:'slide-canvas ppt-layout-preview','aria-hidden':'true'});
        renderSlide(sample,slide(key,app.state.theme),{aspect:aspect()});
        const card=button('',()=>addSlide(key),{className:'ppt-layout-card'});
        card.append(sample,el('span',{},label));return card;
      });
      const last=app.state.slides.length-1;
      return [
        section('Додати слайд',el('div',{className:'ppt-layout-grid'},...layoutCards)),
        section('Поточний слайд',commands(button('Назва слайда',editTitle),button('Дублювати',duplicateSlide),
          button('← Раніше',()=>moveSlide(active-1),{disabled:active===0}),
          button('Пізніше →',()=>moveSlide(active+1),{disabled:active===last}),
          pressed('Приховати в показі',current().hidden,()=>changeSlide(s=>s.hidden=!s.hidden)),
          button('Видалити',deleteSlide,{className:'danger',disabled:last===0})),
          field('Перемістити на місце',select(active,app.state.slides.map((_,i)=>[i,`Слайд ${i+1}`]),value=>moveSlide(Number(value))))),
        button('Знайти й замінити',findText)
      ];
    },
    insert(){
      const shapeButtons=Object.entries(shapeLabels).map(([type,label])=>{
        const shape={...object(type),x:110,y:90,w:740,h:360,fill:'#e78b68',stroke:'#53302b',strokeWidth:5};
        const tile=el('span',{className:'slide-canvas ppt-shape-preview','aria-hidden':'true'});
        renderSlide(tile,{background:'#f5e6dd',objects:[shape]});
        const control=button('',()=>insertShape(type),{className:'ppt-layout-card'});
        control.append(tile,el('span',{},label));return control;
      });
      return [
        commands(button('Текст',()=>editText(object(),true)),button('Фото',insertImage),button('Таблиця',()=>editTable(object('table'),true)),
          button('Вставити копію',()=>addObject(rollCopy(clipboard)),{disabled:!clipboard}),button('Шари слайда',()=>openPanel('layers'))),
        section('Фігури',el('div',{className:'ppt-shape-grid'},...shapeButtons))
      ];
    },
    design(){
      const themes=Object.entries(SLIDE_THEMES).map(([key,palette])=>{
        const tile=button('',()=>setTheme(key),{className:'ppt-theme',title:palette.label,'aria-label':palette.label});
        tile.append(el('span',{className:'ppt-theme-sample',style:`background:${palette.background};color:${palette.text};--ppt-theme-accent:${palette.accent}`},'Аа'),
          el('span',{},palette.label));
        if(themeScope==='deck')tile.setAttribute('aria-pressed',String(app.state.theme===key));
        return tile;
      });
      return [
        section('Теми',field('Застосувати до',select(themeScope,[['deck','Усі слайди'],['slide','Поточний слайд']],value=>{themeScope=value;renderPanel();})),
          el('div',{className:'ppt-theme-grid'},...themes)),
        section('Параметри слайда',el('div',{className:'ppt-field-grid'},
          field('Фон цього слайда',color(current().background,value=>changeSlide(s=>s.background=value))),
          field('Формат презентації',select(aspect(),[['wide','16:9 · широкий'],['standard','4:3 · стандартний']],
            value=>app.change(()=>{app.state.aspect=value;})))))
      ];
    },
    show(){
      const target=current();
      return [
        commands(button('З початку',()=>present(0),{className:'ppt-primary'}),button('З поточного слайда',()=>present(active)),
          button('Нотатки доповідача',editNotes),button('Анімації об’єктів',()=>openPanel('animation'))),
        section('Перехід поточного слайда',el('div',{className:'ppt-field-grid'},
          field('Ефект',select(target.transition||'none',transitions,value=>changeSlide(s=>s.transition=value))),
          field('Автоперехід, с (0 — вручну)',number(target.advance||0,0,600,value=>changeSlide(s=>s.advance=value)))),
          button('Застосувати перехід до всіх',()=>app.change(()=>{
            for(const s of app.state.slides){s.transition=target.transition;s.advance=target.advance;}
          })))
      ];
    },
    object(){
      if(!item())return [el('p',{className:'muted'},'Торкнися об’єкта на слайді або вибери його в шарах.'),button('Відкрити шари',()=>openPanel('layers'))];
      const tabs=commands(...[['style','Стиль'],['position','Розташування']].map(([key,label])=>
        pressed(label,inspector===key,()=>{inspector=key;renderPanel();})));
      return [tabs,...(inspector==='style'?styleControls(item()):positionControls(item()))];
    },
    animation(){
      const target=item(),entries=orderedAnimations(current().objects);
      const settings=animationFor(target?.animation);
      const fields=[field('Ефект появи',select(settings.effect,Object.entries(ANIMATION_EFFECTS),effect=>setAnimation({effect})))];
      if(settings.effect!=='none'){
        fields.push(field('Початок',select(settings.trigger,Object.entries(ANIMATION_TRIGGERS),trigger=>setAnimation({trigger}))));
        if(settings.effect!=='appear')fields.push(field('Тривалість, с',number(settings.duration,.1,5,duration=>setAnimation({duration}),.1)));
      }
      const sequence=el('ol',{className:'ppt-animation-list','aria-label':'Порядок анімацій'},
        ...entries.map(({object:o,index:objectIndex,animation},index)=>el('li',{},
          el('span',{className:'ppt-animation-position','aria-hidden':'true'},String(index+1)),
          pressed(`${objectLabel(o,objectIndex)} · ${ANIMATION_EFFECTS[animation.effect]}`,selected===objectIndex,()=>{
            selected=objectIndex;renderSelection();
          }),
          button('↑',()=>moveAnimation(index,-1),{disabled:index===0,'aria-label':`Анімація ${index+1}: раніше`}),
          button('↓',()=>moveAnimation(index,1),{disabled:index===entries.length-1,'aria-label':`Анімація ${index+1}: пізніше`})
        )));
      return [
        target?section(objectLabel(target,selected),el('div',{className:'ppt-field-grid'},...fields)):
          el('p',{className:'muted'},'Торкнися об’єкта на слайді або вибери його в шарах.'),
        entries.length?section('Порядок появи',sequence,
          button('Переглянути анімації',event=>previewAnimations(event.currentTarget))):null,
        button('Шари слайда',()=>openPanel('layers'))
      ];
    },
    layers(){
      const targets=current().objects;
      if(!targets.length)return [el('p',{className:'muted'},'На слайді ще немає об’єктів.'),button('Вставити об’єкт',()=>openPanel('insert'))];
      const rows=Array.from(targets.entries()).reverse().map(([index,o])=>el('li',{},
        pressed(objectLabel(o,index),selected===index,()=>{selected=index;renderSelection();}),
        el('input',{type:'checkbox',checked:layerSelection.has(index),'aria-label':`Додати до групового вибору: ${objectLabel(o,index)}`,
          onChange:event=>{if(event.target.checked)layerSelection.add(index);else layerSelection.delete(index);renderPanel();}})));
      const arrange=layerSelection.size>1?section('Вирівняти вибрані',
        commands(button('Вліво',()=>arrangeSelection('x','start')),button('По центру',()=>arrangeSelection('x','middle')),
          button('Вправо',()=>arrangeSelection('x','end')),button('Вгору',()=>arrangeSelection('y','start')),
          button('Посередині',()=>arrangeSelection('y','middle')),button('Вниз',()=>arrangeSelection('y','end')),
          button('Розподілити горизонтально',()=>arrangeSelection('x','space'),{disabled:layerSelection.size<3}),
          button('Розподілити вертикально',()=>arrangeSelection('y','space'),{disabled:layerSelection.size<3})))
        :null;
      return [
        button('Анімація вибраного об’єкта',()=>openPanel('animation'),{disabled:!item()}),
        el('ol',{className:'ppt-layers','aria-label':'Об’єкти від переднього до заднього плану'},...rows),arrange
      ];
    }
  };
  function arrangeSelection(axis,mode){
    const items=[...layerSelection].sort((a,b)=>a-b).map(index=>current().objects[index]).filter(Boolean);
    if(items.length<(mode==='space'?3:2))return;
    const size=axis==='x'?'w':'h',limit=axis==='x'?960:540;
    app.change(()=>{
      const start=Math.min(...items.map(o=>o[axis])),end=Math.max(...items.map(o=>o[axis]+o[size]));
      if(mode==='space'){
        items.sort((a,b)=>a[axis]-b[axis]);
        const gap=(end-start-items.reduce((sum,o)=>sum+o[size],0))/(items.length-1);
        let cursor=start;
        for(const o of items){o[axis]=clamp(cursor,0,limit-o[size]);cursor+=o[size]+gap;}
      }else for(const o of items){
        const value=mode==='start'?start:mode==='end'?end-o[size]:(start+end-o[size])/2;
        o[axis]=clamp(value,0,limit-o[size]);
      }
    });
  }
  function styleControls(o){
    const set=(key,value)=>changeObject(target=>{target[key]=value;});
    const fields=[],actions=[];
    if(o.type==='text'||o.type==='table'){
      fields.push(
        field('Шрифт',select(o.font||'Arial',SLIDE_FONTS.map(font=>[font,font]),value=>set('font',value))),
        field('Розмір, пт',number(Math.round(o.size*.75),8,o.type==='table'?54:90,value=>set('size',value/.75))),
        field('Колір тексту',color(o.color,value=>set('color',value))));
      actions.push(pressed('Напівжирний',o.bold,()=>set('bold',!o.bold)));
      if(o.type==='text'){
        fields.push(field('По горизонталі',select(o.align,[['left','Ліворуч'],['center','По центру'],['right','Праворуч'],['justify','За шириною']],value=>set('align',value))),
          field('По вертикалі',select(o.valign||'top',[['top','Угорі'],['middle','Посередині'],['bottom','Унизу']],value=>set('valign',value))),
          field('Список',select(o.bullets||'none',[['none','Без списку'],['bullet','Маркований'],['number','Нумерований']],value=>set('bullets',value))));
        actions.unshift(button('Редагувати текст',()=>editText()));
        actions.push(pressed('Курсив',o.italic,()=>set('italic',!o.italic)),pressed('Підкреслений',o.underline,()=>set('underline',!o.underline)));
      }else actions.unshift(button('Редагувати комірки',()=>editTable()));
    }
    if(o.type==='image'){
      fields.push(field('Уміщення фото',select(o.fit||'stretch',[['contain','Показати все'],['cover','Заповнити рамку'],['stretch','Розтягнути']],value=>set('fit',value))));
      actions.push(button('Опис зображення',()=>{
        const input=el('input',{value:o.alt||'',maxlength:160});
        openForm('Опис зображення',field('Альтернативний текст',input),()=>set('alt',input.value.trim()),'Зберегти',input);
      }));
    }
    if(shapeLabels[o.type]||o.type==='table'){
      if(o.type!=='line'&&(o.type!=='table'||o.head))fields.push(field(o.type==='table'?'Заливка заголовка':'Заливка',color(o.fill,value=>set('fill',value))));
      fields.push(field('Контур',color(o.stroke,value=>set('stroke',value))),
        field('Товщина контуру',number(o.strokeWidth??1,0,24,value=>set('strokeWidth',value),.5)));
    }
    fields.push(field('Видимість, %',number(o.opacity??100,0,100,value=>set('opacity',value))));
    actions.push(button(o.link?'Змінити посилання':'Додати посилання',editLink));
    return [commands(...actions),el('div',{className:'ppt-field-grid'},...fields)];
  }
  function positionControls(o){
    const last=current().objects.length-1;
    const measure=(label,key,min,max)=>field(label,number(Math.round(o[key]),min,max,value=>changeObject(target=>{
      target[key]=value;target.x=Math.min(target.x,960-target.w);target.y=Math.min(target.y,540-target.h);
    })));
    return [
      el('div',{className:'ppt-field-grid'},measure('X','x',0,960-o.w),measure('Y','y',0,540-o.h),
        measure('Ширина','w',20,960),measure('Висота','h',20,540),measure('Поворот, °','rotation',-180,180)),
      section('Розташування',commands(
        button('По центру слайда',()=>changeObject(target=>{target.x=(960-target.w)/2;target.y=(540-target.h)/2;})),
        button('Лівий край',()=>changeObject(target=>{target.x=0;})),
        button('Правий край',()=>changeObject(target=>{target.x=960-target.w;})),
        pressed('Прив’язка під час руху',snap,()=>{snap=!snap;renderPanel();}))),
      section('Шари й копії',commands(
        button('На передній план',()=>shiftLayer(last),{disabled:selected===last}),
        button('На задній план',()=>shiftLayer(0),{disabled:selected===0}),
        button('На шар вище',()=>shiftLayer(selected+1),{disabled:selected===last}),
        button('На шар нижче',()=>shiftLayer(selected-1),{disabled:selected===0}),
        button('Дублювати',()=>addObject(rollCopy(o))),button('Копіювати',copyObject),
        button('Видалити',()=>deleteObject(),{className:'danger'})))
    ];
  }

  function openPanel(key,opener=null,focus=false){
    if(opener)panelOpener=opener;
    opened=key;drawer.hidden=false;app.host.classList.add('ppt-panel-open');panelBody.scrollTop=0;renderPanel();fitDrawer();
    if(focus)panelTitle.focus({preventScroll:true});
  }
  function closePanel(restoreFocus=false){
    opened=null;drawer.hidden=true;app.host.classList.remove('ppt-panel-open');renderPanel();
    if(restoreFocus)(panelOpener?.isConnected?panelOpener:canvas).focus({preventScroll:true});
    panelOpener=null;
    scrollToSlide();
  }
  function togglePanel(key,opener=null,focus=false){
    if(opened===key)closePanel(focus);
    else openPanel(key,opener,focus);
  }
  function renderPanel(){
    for(const [key,tab] of panelButtons)tab.setAttribute('aria-expanded',String(key===opened));
    filmRow.lastElementChild.setAttribute('aria-expanded',String(opened==='slides'));
    contextBar.querySelector('[data-ppt-animate]')?.setAttribute('aria-expanded',String(opened==='animation'));
    if(!opened){panelBody.replaceChildren();return;}
    panelTitle.textContent=panelLabels[opened];
    const before=panelBody.scrollTop;
    panelBody.replaceChildren(...panels[opened]().filter(Boolean));
    panelBody.scrollTop=before;
  }
  function renderCanvas(){
    renderSlide(canvas,current(),{aspect:aspect(),selected,interactive:true});
  }
  function renderContext(){
    const o=item();
    contextBar.hidden=!o;
    if(!o)return;
    contextBar.replaceChildren(el('span',{className:'ppt-selected-label'},objectLabel(o,selected)),
      ...(o.type==='text'||o.type==='table'?[button(o.type==='text'?'Текст':'Комірки',()=>editSelected())]:[]),
      button('Об’єкт',event=>togglePanel('object',event.currentTarget,event.detail===0)),
      button('Шари',event=>togglePanel('layers',event.currentTarget,event.detail===0)),
      button('Анімація',event=>togglePanel('animation',event.currentTarget,event.detail===0),
        {'data-ppt-animate':'','aria-controls':'ppt-drawer','aria-expanded':String(opened==='animation')}));
  }
  function renderSelection(){
    renderCanvas();renderContext();
    if(opened==='object'||opened==='layers'||opened==='animation')renderPanel();
  }
  function titleOf(s){
    return s.title||s.objects.find(o=>o.type==='text'&&o.text.trim())?.text.trim().split('\n')[0]||'Порожній слайд';
  }
  function drawThumb(entry){
    renderSlide(entry.stage,entry.slide,{aspect:aspect()});
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const notice of entries){
      const entry=thumbnails.get(notice.target);
      if(!entry)continue;
      entry.visible=notice.isIntersecting;
      if(entry.visible)drawThumb(entry);
      else if(entry.slide!==current())entry.stage.replaceChildren();
    }
  },{root:film,rootMargin:'90px'}):null;
  function updateFilm(){
    const slides=app.state.slides;
    if(filmOrder.length!==slides.length||slides.some((s,i)=>s!==filmOrder[i])){
      const offset=[film.scrollLeft,film.scrollTop];
      observer?.disconnect();thumbnails.clear();filmOrder=[...slides];
      const tiles=slides.map((s,i)=>{
        const stage=el('span',{className:'slide-canvas ppt-thumbnail-stage','aria-hidden':'true'});
        const control=button('',()=>selectSlide(app.state.slides.indexOf(s)),{className:'slide-thumbnail'});
        const label=el('span',{className:'ppt-thumbnail-caption'},el('span',{}),el('small',{}));
        control.append(stage,label);
        const handle=el('button',{
          type:'button',className:'ppt-film-handle','data-film-reorder':'','aria-label':`Перемістити слайд ${i+1}`,
          title:'Перетягни, щоб змінити порядок слайдів','aria-describedby':filmInstructions.id,
          'aria-keyshortcuts':'ArrowLeft ArrowRight ArrowUp ArrowDown Home End',disabled:slides.length<2
        });
        const tile=el('div',{className:'ppt-film-item',role:'listitem','data-slide-index':i},control,handle);
        thumbnails.set(tile,{slide:s,control,stage,label,index:i,visible:!observer});
        return tile;
      });
      film.replaceChildren(...tiles);
      for(const tile of tiles)observer?.observe(tile);
      film.scrollLeft=offset[0];film.scrollTop=offset[1];
    }
    for(const entry of thumbnails.values()){
      const {slide:s,index,label,stage,control}=entry;
      const title=titleOf(s);
      control.setAttribute('aria-label',`Слайд ${index+1}. ${title.slice(0,110)}${s.hidden?' · приховано в показі':''}`);
      control.setAttribute('aria-pressed',String(active===index));
      label.firstElementChild.textContent=String(index+1);
      label.lastElementChild.textContent=s.hidden?'Приховано':title;
      stage.style.backgroundColor=s.background;
      stage.style.aspectRatio=SLIDE_ASPECTS[aspect()].join(' / ');
      if(entry.visible||active===index)drawThumb(entry);
    }
  }
  function scrollToSlide(){
    const target=film.querySelector('[aria-pressed="true"]')?.closest('.ppt-film-item');
    if(!target||!film.clientWidth||!film.clientHeight)return;
    const inner=target.getBoundingClientRect(),outer=film.getBoundingClientRect();
    if(inner.left<outer.left)film.scrollLeft+=inner.left-outer.left;
    if(inner.right>outer.right)film.scrollLeft+=inner.right-outer.right;
    if(inner.top<outer.top)film.scrollTop+=inner.top-outer.top;
    if(inner.bottom>outer.bottom)film.scrollTop+=inner.bottom-outer.bottom;
  }
  function render(){
    active=Math.min(active,app.state.slides.length-1);
    selected=Math.min(selected,current().objects.length-1);
    const [w,h]=SLIDE_ASPECTS[aspect()];
    app.host.style.setProperty('--ppt-ratio',String(w/h));
    importNote.hidden=!app.state.importWarnings?.length;
    updateFilm();renderCanvas();renderContext();renderPanel();fitDrawer();
    if(revealResume){revealResume=false;scrollToSlide();}
  }
  const detachCanvas=bindSlideCanvas(canvas,{
    getSlide:current,getSelected:()=>selected,getSnap:()=>snap,
    onSelect:index=>{selected=index;renderSelection();},
    onCommit:(index,patch)=>{if(current().objects[index])app.change(()=>Object.assign(current().objects[index],patch));},
    onEdit:editSelected,onDelete:deleteObject
  });
  const detachFilm=bindFilmReorder(film,{onMove:reorderSlide,onAnnounce:message=>{
    filmStatus.textContent=message;
  }});
  function filmKeys(event){
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
    const tile=event.target.closest('.slide-thumbnail')?.closest('.ppt-film-item');
    if(tile?.parentElement!==film)return;
    const index=Number(tile.dataset.slideIndex),last=app.state.slides.length-1;
    const targets={ArrowLeft:index-1,ArrowUp:index-1,ArrowRight:index+1,ArrowDown:index+1,Home:0,End:last,PageUp:index-1,PageDown:index+1};
    if(!Object.hasOwn(targets,event.key))return;
    event.preventDefault();
    const next=clamp(targets[event.key],0,last);
    selectSlide(next);
    film.children[next]?.querySelector('.slide-thumbnail')?.focus({preventScroll:true});
  }
  function editorKeys(event){
    if(event.defaultPrevented||closeShow||event.target.closest('dialog')||dialogs.size)return;
    if(event.key==='Escape'&&opened){event.preventDefault();closePanel(true);return;}
    if(event.target.closest('input,select,textarea,[contenteditable="true"]')||event.altKey)return;
    const command=event.ctrlKey||event.metaKey;
    if(command&&event.key.toLowerCase()==='m'){
      event.preventDefault();if(!event.repeat)addSlide('heading');
    }else if(!command&&event.key==='F5'){
      event.preventDefault();if(!event.repeat)present(event.shiftKey?active:0);
    }else if(!command&&(event.key==='PageUp'||event.key==='PageDown')){
      event.preventDefault();
      selectSlide(clamp(active+(event.key==='PageUp'?-1:1),0,app.state.slides.length-1));
    }
  }
  film.addEventListener('keydown',filmKeys);
  root.addEventListener('keydown',editorKeys);
  const phone=matchMedia('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)');
  function placePanels(){
    const focus=document.activeElement;
    if(phone.matches)app.host.append(drawer,app.tools);
    else{
      app.host.insertBefore(app.tools,app.body);
      app.host.insertBefore(drawer,app.body.nextElementSibling);
    }
    if((drawer.contains(focus)||app.tools.contains(focus))&&document.activeElement!==focus)focus.focus({preventScroll:true});
  }
  placePanels();
  phone.addEventListener('change',placePanels);
  const fixedBars=[app.host.querySelector('.office-top'),app.host.querySelector('.office-status'),app.tools,contextBar,filmRow];
  function fitDrawer(){
    if(!phone.matches)return;
    const available=app.host.clientHeight;
    let reserved=0;
    for(const bar of fixedBars)if(bar!==filmRow||phone.matches)reserved+=bar.offsetHeight;
    const work=Math.max(0,available-reserved);
    const limit=Math.min(430,available*.55,Math.max(0,work-Math.min(118,work*.32)));
    app.host.style.setProperty('--ppt-drawer-height',`${limit}px`);
  }
  const viewportObserver=new ResizeObserver(fitDrawer);
  for(const bar of fixedBars)viewportObserver.observe(bar);
  viewportObserver.observe(app.host);
  function viewport(){
    const view=window.visualViewport;
    if(view&&Math.abs(view.scale-1)>.03)return;
    const height=view?.height||window.innerHeight;
    app.host.style.setProperty('--ppt-top',`${Math.max(0,view?.offsetTop||0)}px`);
    app.host.style.setProperty('--ppt-height',`${height}px`);
    app.host.classList.toggle('ppt-short',height<430);
    fitDrawer();
  }
  viewport();
  window.visualViewport?.addEventListener('resize',viewport);
  window.visualViewport?.addEventListener('scroll',viewport);
  window.addEventListener('resize',viewport);
  app.setRender(render,{
    getPosition:()=>({slide:active}),
    restorePosition:position=>{
      if(!Number.isInteger(position.slide)||position.slide<0)return;
      active=position.slide;
      revealResume=true;
    }
  });
  return {...app.lifecycle,dispose(){
    closeShow?.();
    for(const dialog of dialogs)dialog.close();
    observer?.disconnect();viewportObserver.disconnect();detachCanvas();detachFilm();
    root.removeEventListener('keydown',editorKeys);film.removeEventListener('keydown',filmKeys);
    phone.removeEventListener('change',placePanels);
    window.visualViewport?.removeEventListener('resize',viewport);
    window.visualViewport?.removeEventListener('scroll',viewport);
    window.removeEventListener('resize',viewport);
    app.lifecycle.dispose();
  }};
}
