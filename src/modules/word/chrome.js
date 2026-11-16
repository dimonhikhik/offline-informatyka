import { el } from '../../components/ui.js';
import { documentThemes,paragraphStyles,styleFont,styleFor } from './styles.js';
import { wordMobileMedia } from './mobile-editing.js';
const paths={
 back:'M15 5l-7 7 7 7',undo:'M9 5L4 10l5 5M4 10h10a6 6 0 0 1 0 12',redo:'M15 5l5 5-5 5M20 10H10a6 6 0 0 0 0 12',
 save:'M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8',plus:'M12 4v16M4 12h16',
 search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',more:'M5 11v2M12 11v2M19 11v2',
 close:'M6 6l12 12M18 6L6 18',table:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
 image:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',link:'M10 14l4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
 left:'M3 4h18M3 9h12M3 14h18M3 19h12',center:'M3 4h18M6 9h12M3 14h18M6 19h12',right:'M3 4h18M9 9h12M3 14h18M9 19h12',justify:'M3 4h18M3 9h18M3 14h18M3 19h18',
 bullets:'M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13',numbered:'M2 3h2v5M2 8h4M2 13h4l-4 6h4M9 5h12M9 12h12M9 19h12',
 bold:'M7 3h6a5 5 0 0 1 0 9H7V3M7 12h7a5 5 0 0 1 0 9H7v-9',italic:'M10 3h9M5 21h9M15 3L9 21',underline:'M6 3v8a6 6 0 0 0 12 0V3M4 21h16',
 print:'M7 8V3h10v5M7 17H3V9h18v8h-4M7 14h10v7H7z',file:'M5 3h9l5 5v13H5zM14 3v6h5',format:'M3 20L9 4l6 16M5 14h8M16 8h6M19 5v6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 edit:'M4 20l1-5L16 4l4 4L9 19zM13 7l4 4',layout:'M4 3h16v18H4zM7 7h10M7 11h10M7 15h6',
 chevron:'M5 15l7-7 7 7',minus:'M4 12h16'
};
export function icon(name){const node=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:22,height:22,fill:'none',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))node.setAttribute(k,v);const path=document.createElementNS(node.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.file);node.append(path);return node;}
export function buildChrome({pauseEditing,formattingTools,documentTools,tableExtras,tableTools,tableSelectionBar,hasTableCell,host,name,status,counter,ribbon,insertTools,layout,searchTools,revealSearchHit,toolbar,undoButton,redoButton,previewButton,workspace,command,activeParagraphStyle,applyParagraphStyle,applyDocumentTheme,getTheme,outlineTool,objectsTool,reviewTool}){
  const media=matchMedia(wordMobileMedia),mirrors=[];
  let active='home',sheetOpen=false,ribbonCollapsed=false,opener=null,practiceGuide=null,zoomPreference=null,pageZoom=1;
  const tabs=new Map(),panels=new Map();
  const tabOrder=['file','home','insert','layout','review','view','table','search'];
  function action(label,glyph,fn,extra=''){return el('button',{type:'button',className:`word-icon-button ${extra}`,title:label,'aria-label':label,onPointerdown:e=>e.preventDefault(),onClick:fn},icon(glyph));}
  function mirror(source,label,glyph,extra=''){const b=action(label,glyph,()=>source.click(),extra);mirrors.push([source,b]);return b;}
  function group(label,...content){return el('section',{className:'word-ribbon-group','aria-label':label},el('div',{className:'word-ribbon-group-label'},label),el('div',{className:'word-ribbon-group-content'},...content));}
  const oldGroups=[...ribbon.children],fontControls=[...oldGroups[0].children],fontActions=[...oldGroups[1].children],paragraphActions=[...oldGroups[2].children];
  const formats=[['bold','Напівжирний'],['italic','Курсив'],['underline','Підкреслення']];
  const tracked=[];
  formats.forEach(([key,label],i)=>{const b=fontActions[i];b.replaceChildren(icon(key));b.title=label;b.setAttribute('aria-label',label);b.dataset.command=key;tracked.push(b);});
  ['left','center','right','justify','bullets','numbered'].forEach((key,i)=>{const b=paragraphActions[i],label=b.textContent;b.replaceChildren(icon(key));b.title=label;b.setAttribute('aria-label',label);});
  const tabbar=el('div',{className:'word-tabs',role:'tablist','aria-label':'Вкладки стрічки'});
  const panelArea=el('div',{className:'word-panel-area'});
  const close=action('Згорнути інструменти','close',e=>dismiss(e.detail===0));
  const sheetHeading=el('strong',{id:'word-sheet-heading',tabindex:-1},'Форматування');
  const sheetTop=el('div',{className:'word-sheet-heading'},sheetHeading,close);
  const titles={home:'Основне',insert:'Вставлення',layout:'Макет',review:'Рецензування',view:'Вигляд',file:'Файл',search:'Пошук',table:'Таблиця',tools:'Інші інструменти'};
  const mobileTitles={...titles,home:'Форматування',search:'Пошук і заміна'};
  function display(){
    for(const [key,panel]of panels){
      panel.hidden=key!==active;
      const tab=tabs.get(key);
      if(tab){tab.setAttribute('aria-selected',String(key===active));tab.tabIndex=key===active?0:-1;}
    }
    host.classList.toggle('word-sheet-open',media.matches&&sheetOpen);
    sheet.hidden=!media.matches&&ribbonCollapsed;
    const expanded=String(!ribbonCollapsed),toggleLabel=ribbonCollapsed?'Розгорнути стрічку':'Згорнути стрічку';
    ribbonToggle.setAttribute('aria-expanded',expanded);ribbonToggle.setAttribute('aria-label',toggleLabel);ribbonToggle.title=toggleLabel;
    sheetHeading.textContent=mobileTitles[active];
    backToTools.hidden=!['file','search','view'].includes(active);
    for(const b of host.querySelectorAll('[data-open-panel]')){
      b.setAttribute('aria-expanded',String(sheetOpen&&active===b.dataset.openPanel));
    }
    requestViewport();
  }
  function dismiss(restoreFocus=false){
    host.classList.remove('word-sheet-entry');
    sheetOpen=false;display();
    if(restoreFocus){
      const target=opener?.offsetWidth?opener:mobileMore;
      target.focus({preventScroll:true});
    }
    opener=null;
  }
  function show(key,focusHeading=false){
    if(media.matches)pauseEditing();
    else ribbonCollapsed=false;
    active=key;sheetOpen=true;display();
    if(media.matches){panelArea.scrollTop=0;if(focusHeading)sheetHeading.focus({preventScroll:true});}
  }
  function panel(key,...groups){
    const tab=el('button',{type:'button',id:`word-tab-${key}`,role:'tab','aria-controls':`word-panel-${key}`,onPointerdown:e=>e.preventDefault(),onClick:()=>show(key)},titles[key]);
    tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabOrder.indexOf(key),next=e.key==='Home'?0:e.key==='End'?tabOrder.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabOrder.length)%tabOrder.length;show(tabOrder[next]);tabs.get(tabOrder[next]).focus();});
    const p=el('div',{className:`word-tab-panel word-panel-${key}`,id:`word-panel-${key}`,role:'tabpanel','aria-labelledby':tab.id},...groups);tabs.set(key,tab);panels.set(key,p);tabbar.append(tab);panelArea.append(p);return p;
  }
  const stylePicker=el('select',{'aria-label':'Стиль абзацу',onChange:e=>applyParagraphStyle(e.target.value)},el('option',{value:'',disabled:true},'Вибрати стиль'),el('option',{value:'mixed',disabled:true},'Різні стилі'),
    ...Object.entries(paragraphStyles).map(([key,style])=>el('option',{value:key},style.label)));
  const styleButtons=['normal','h1','h2'].map(key=>el('button',{
    type:'button',className:'word-style-tile','data-style':key,title:paragraphStyles[key].label,
    'aria-label':paragraphStyles[key].label,onPointerdown:e=>e.preventDefault(),onClick:()=>applyParagraphStyle(key)
  },el('small',{},key==='normal'?'Текст':paragraphStyles[key].label)));
  const home=panel('home',
    group('Стилі',el('label',{className:'word-field'},el('span',{},'Стиль абзацу'),stylePicker),...styleButtons),
    group('Шрифт',el('div',{className:'word-control-row'},fontControls[0],fontControls[1]),el('div',{className:'word-control-row'},...fontActions)),
    group('Абзац',el('div',{className:'word-control-row'},...paragraphActions),oldGroups[3]),
    group('Редагування',el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:e=>show('search',e.detail===0)},icon('search'),'Знайти й замінити')));
  // Explicit desktop rows keep labels, selects and icon actions from wrapping together.
  [...home.children].forEach((node,i)=>node.classList.add(['word-styles-group','word-font-group','word-paragraph-group','word-editing-group'][i]));
  const compactActions=[[fontActions[6],'format'],[paragraphActions[6],'left'],[paragraphActions[7],'right']];
  for(const [button,glyph] of compactActions){const label=button.textContent;button.title=label;button.setAttribute('aria-label',label);button.classList.add('word-compact-command');button.replaceChildren(icon(glyph),el('span',{},label));}
  fontActions[6].classList.add('word-clear-format');
  for(const label of home.querySelectorAll('.word-field')){const control=label.querySelector('input,select');if(control){const text=label.querySelector('span')?.textContent||'';control.title=text;if(!control.hasAttribute('aria-label'))control.setAttribute('aria-label',text);}}
  const insertRow=insertTools.querySelector('.word-tool-group'),insertChildren=[...insertRow.children];
  [0,5,6].forEach((index,i)=>{const b=insertChildren[index],label=b.textContent;b.replaceChildren(icon(['table','image','link'][i]),el('span',{},label));b.classList.add('word-large-command');});
  panel('insert',group('Таблиця',insertChildren[0]),group('Ілюстрації та посилання',...insertChildren.slice(5),objectsTool),group('Структура та формули',documentTools));
  const tableCommands=el('div',{className:'word-table-edit-commands'},...insertChildren.slice(1,5),tableExtras);
  const tablePanel=panel('table',tableCommands,tableTools);
  const layoutRow=layout.querySelector('.word-tool-group'),layoutChildren=[...layoutRow.children];
  const themeButtons=Object.entries(documentThemes).map(([key,theme])=>{
    const heading=styleFor(key,'h1'),body=styleFor(key,'normal');
    return el('button',{type:'button',className:'word-theme-card','data-theme':key,
      onPointerdown:e=>e.preventDefault(),onClick:()=>applyDocumentTheme(key)},
      el('span',{className:'word-theme-sample','aria-hidden':'true',
        style:`--sample-heading:${styleFont(heading)};--sample-body:${styleFont(body)};--sample-accent:${heading.color}`},
        el('strong',{},'Аа'),el('span',{},'Абзац тексту')),
      el('span',{},theme.label));
  });
  panel('layout',group('Стиль документа',el('div',{className:'word-theme-grid'},...themeButtons)),
    group('Параметри сторінки',...layoutChildren.slice(0,2)),group('Текст і список',formattingTools),group('Колонтитули',...layoutChildren.slice(2)),el('p',{className:'word-panel-note'},layout.querySelector('p').textContent));
  panel('view',group('Перегляд',previewButton,outlineTool));
  panel('review',group('Виправлення',reviewTool));
  const fileButtons=[...toolbar.querySelectorAll(':scope > button')];
  panel('file',group('Документ',...fileButtons.slice(0,3)),group('Експорт і друк',...fileButtons.slice(3)),group('Надіслати роботу',toolbar.querySelector('a')));
  panel('search',group('Пошук і заміна',searchTools.querySelector('.word-tool-group')));
  tabbar.replaceChildren(...tabOrder.map(key=>tabs.get(key)));
  function labeledAction(label,glyph,fn,className){
    const button=action(label,glyph,fn,className);
    button.append(el('span',{},label));
    return button;
  }
  function openPanel(key,label,glyph){
    const button=labeledAction(label,glyph,e=>{
      if(sheetOpen&&active===key){dismiss(e.detail===0);return;}
      const fromDock=e.currentTarget.closest('.word-mobile-bar');
      if(fromDock)opener=e.currentTarget;
      show(key,e.detail===0);
    },'word-labeled-action');
    button.dataset.openPanel=key;
    button.setAttribute('aria-controls',`word-panel-${key}`);
    return button;
  }
  const backToTools=action('До інших інструментів','back',e=>show('tools',e.detail===0),'word-sheet-back');
  sheetTop.prepend(backToTools);
  const mobileCounter=el('div',{className:'word-mobile-counter'});
  const mobileSearch=openPanel('search','Пошук і заміна','search');
  const toolsPanel=el('div',{id:'word-panel-tools',className:'word-tab-panel word-panel-tools',role:'region','aria-labelledby':'word-sheet-heading'},
    el('div',{className:'word-tools-menu'},openPanel('file','Файл та експорт','file'),mobileSearch,openPanel('view','Вигляд','eye'),
      labeledAction('Структура','numbered',()=>outlineTool.click(),'word-labeled-action'),
      labeledAction('Рецензування','edit',()=>reviewTool.click(),'word-labeled-action'),
      labeledAction('Зберегти','save',()=>fileButtons[2].click(),'word-labeled-action')),
    mobileCounter);
  panels.set('tools',toolsPanel);panelArea.append(toolsPanel);
  const save=mirror(fileButtons[2],'Зберегти','save','word-desktop-save');
  const ribbonToggle=action('Згорнути стрічку','chevron',()=>{ribbonCollapsed=!ribbonCollapsed;display();},'word-desktop-ribbon-toggle');
  ribbonToggle.setAttribute('aria-controls','word-command-ribbon');
  const quick=el('div',{className:'word-quick-access'},mirror(undoButton,'Скасувати','undo'),mirror(redoButton,'Повторити','redo'),save,ribbonToggle);
  const back=el('a',{href:'#catalog',className:'word-icon-button',title:'До каталогу','aria-label':'До каталогу'},icon('back'));
  const title=el('div',{className:'word-document-title'},name);
  const header=el('div',{className:'word-titlebar'},back,el('span',{className:'word-app-badge','aria-hidden':'true'},'W'),title,quick);
  const paper=workspace.querySelector('.word-paper');
  const zoomLabel=el('output',{'aria-label':'Масштаб'},'100%');
  const fitPage=el('button',{type:'button','aria-pressed':'true',onClick:()=>{zoomPreference=null;fitWorkspace();}},'За шириною');
  function setZoom(value){
    zoomPreference=Math.max(.35,Math.min(1.5,value));
    fitWorkspace();
  }
  function fitWorkspace(){
    if(media.matches||!workspace.clientWidth||!paper.offsetWidth)return;
    const style=getComputedStyle(workspace);
    const width=workspace.clientWidth-Number.parseFloat(style.paddingLeft)-Number.parseFloat(style.paddingRight);
    const next=zoomPreference??Math.max(.35,Math.min(1,width/paper.offsetWidth));
    if(next!==pageZoom){pageZoom=next;paper.style.setProperty('--word-page-zoom',String(pageZoom));}
    zoomLabel.textContent=Math.round(pageZoom*100)+'%';
    fitPage.setAttribute('aria-pressed',String(zoomPreference===null));
  }
  const statistics=el('div',{className:'word-status-controls'},counter,el('div',{className:'word-page-zoom'},
    action('Зменшити масштаб','minus',()=>setZoom(pageZoom-.1)),zoomLabel,
    action('Збільшити масштаб','plus',()=>setZoom(pageZoom+.1)),fitPage));
  const desktopStatus=el('div',{className:'word-document-status'},status,statistics);
  const sheet=el('section',{id:'word-command-ribbon',className:'word-sheet','aria-labelledby':'word-sheet-heading'},sheetTop,panelArea);
  const chrome=el('div',{className:'word-chrome'},header,tabbar,sheet);
  const mobileTable=openPanel('table','Таблиця','table');
  const mobileMore=openPanel('tools','Ще','more');
  const mobileEdit=labeledAction('До редагування','edit',()=>{previewButton.click();dismiss();},'word-labeled-action word-mobile-edit');
  const mobileReview=labeledAction('Рецензування','edit',()=>{dismiss();reviewTool.click();},'word-labeled-action word-mobile-review');
  const mobileDock=el('div',{className:'word-mobile-dock',role:'group','aria-label':'Інструменти документа'},
    openPanel('home','Формат','format'),openPanel('insert','Вставити','plus'),openPanel('layout','Макет','layout'),mobileTable,mobileEdit,mobileReview,mobileMore);
  const typingTools=el('div',{className:'word-typing-tools',role:'toolbar','aria-label':'Швидке форматування'},
    ...[...formats,['insertUnorderedList','Маркований список','bullets']].map(([key,label,glyph=key])=>{
      const b=action(label,glyph,()=>command(key,null,true));
      b.dataset.command=key;b.dataset.wordImmediate='';tracked.push(b);
      return b;
    }),openPanel('table','Таблиця','table'),openPanel('home','Формат','format'),openPanel('tools','Ще','more'));
  const mobileBar=el('div',{className:'word-mobile-bar'},mobileDock,typingTools);
  const hiddenInputs=[...toolbar.querySelectorAll(':scope > input[type=file]')];
  host.replaceChildren(chrome,workspace,desktopStatus,tableSelectionBar,mobileBar,...hiddenInputs);
  function update(){
    for(const [source,b]of mirrors)b.disabled=source.disabled;
    for(const b of tracked){try{b.setAttribute('aria-pressed',String(document.queryCommandState(b.dataset.command)));}catch{b.setAttribute('aria-pressed','false');}}
    const key=activeParagraphStyle();
    stylePicker.value=key;
    for(const b of styleButtons)b.setAttribute('aria-pressed',String(b.dataset.style===key));
    for(const b of themeButtons)b.setAttribute('aria-pressed',String(b.dataset.theme===getTheme()));
    const preview=host.classList.contains('is-preview'),reviewing=host.classList.contains('is-reviewing');
    host.classList.toggle('word-has-table-cell',hasTableCell());
    mobileSearch.hidden=preview||reviewing;
    outlineTool.disabled=preview||reviewing;
    for(const panel of ['home','insert','layout','table','search'])panels.get(panel).inert=preview||reviewing;
    if(host.classList.contains('is-review-draft'))panels.get('layout').inert=true;
    requestViewport();
  }
  let viewportFrame=0,baselineHeight=window.innerHeight,viewportWidth=window.innerWidth;
  let lastVisibleHeight=0,lastVisibleTop=0;
  const viewportVars=['--word-keyboard','--word-visible-height','--word-viewport-top','--word-dock-height'];
  function viewportChanged(){
    if(!media.matches){fitWorkspace();return;}
    const visual=window.visualViewport;
    if(visual&&Math.abs(visual.scale-1)>.03)return;
    const layoutHeight=window.innerHeight,height=visual?.height||layoutHeight,top=Math.max(0,visual?.offsetTop||0);
    if(Math.abs(window.innerWidth-viewportWidth)>24){
      viewportWidth=window.innerWidth;baselineHeight=layoutHeight;
    }
    baselineHeight=Math.max(baselineHeight,layoutHeight,height);
    const keyboard=Math.max(layoutHeight-height,baselineHeight-height)>110;
    const editing=workspace.contains(document.activeElement);
    const sheetEntry=keyboard&&height<340&&sheetOpen&&sheet.contains(document.activeElement)&&
      document.activeElement.matches('input:not([type=range]),textarea,select');
    const viewportMoved=height!==lastVisibleHeight||top!==lastVisibleTop;
    lastVisibleHeight=height;lastVisibleTop=top;
    host.classList.toggle('word-show-typing-tools',keyboard&&editing&&!sheetOpen&&!host.classList.contains('is-preview'));
    host.classList.toggle('word-short-viewport',height<300);
    host.classList.toggle('word-sheet-entry',sheetEntry);
    const dockHeight=mobileBar.offsetHeight;
    const values=[Math.max(0,layoutHeight-height-top),height,top,dockHeight];
    viewportVars.forEach((property,i)=>document.body.style.setProperty(property,`${values[i]}px`));
    const free=Math.max(0,height-header.offsetHeight-dockHeight-tableSelectionBar.offsetHeight);
    const limit=sheetEntry?free:Math.min(460,free-Math.min(150,free*.35));
    host.style.setProperty('--word-sheet-limit',`${limit}px`);
    if(viewportMoved&&sheetOpen&&active==='search'&&!sheetEntry)revealSearchHit();
    const selection=getSelection();
    if(viewportMoved&&keyboard&&editing&&selection?.rangeCount&&selection.isCollapsed&&workspace.contains(selection.anchorNode)){
      const cursor=selection.getRangeAt(0).getBoundingClientRect(),area=workspace.getBoundingClientRect();
      if(cursor.height&&area.height>24){
        if(cursor.bottom>area.bottom-12)workspace.scrollTop+=cursor.bottom-area.bottom+12;
        else if(cursor.top<area.top+12)workspace.scrollTop-=area.top+12-cursor.top;
      }
    }
  }
  function requestViewport(){if(!viewportFrame)viewportFrame=requestAnimationFrame(()=>{viewportFrame=0;viewportChanged();});}
  function collapseForDocument(){if(media.matches&&sheetOpen)dismiss();}
  function finishTool(e){
    const button=e.target.closest('button');
    if(!media.matches||!button||button.closest('.word-tab-panel')!==panels.get(active)||document.querySelector('.word-dialog[open]'))return;
    if(active==='insert'||active==='view'||button.hasAttribute('data-close-sheet')){
      dismiss(e.detail===0);
    }
  }
  function relocate(){
    if(media.matches){
      host.insertBefore(sheet,mobileBar);title.append(status);mobileCounter.append(counter);
      tableTools.querySelector('.word-table-touch-actions').after(tableCommands);
    }else{
      chrome.append(sheet);desktopStatus.prepend(status);statistics.prepend(counter);
      tablePanel.prepend(tableCommands);
      viewportVars.forEach(name=>document.body.style.removeProperty(name));
      if(active==='tools')active='home';
    }
    for(const [key,tab] of tabs){
      const panel=panels.get(key);
      if(media.matches){panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');}
      else{panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);}
    }
  }
  function keyboard(e){
    if(e.key==='Escape'&&media.matches&&sheetOpen){e.preventDefault();dismiss(true);}
    if(!media.matches&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&!panels.get('search').inert){
      e.preventDefault();show('search');
      panels.get('search').querySelector('input').focus();
    }
  }
  function modeChanged(){baselineHeight=window.innerHeight;lastVisibleHeight=0;sheetOpen=false;opener=null;relocate();display();}
  host.addEventListener('keydown',keyboard);host.addEventListener('focusin',requestViewport);host.addEventListener('focusout',requestViewport);
  media.addEventListener('change',modeChanged);window.visualViewport?.addEventListener('resize',requestViewport);window.visualViewport?.addEventListener('scroll',requestViewport);window.addEventListener('resize',requestViewport);
  workspace.addEventListener('pointerdown',collapseForDocument,true);sheet.addEventListener('click',finishTool);
  const sizeObserver=new ResizeObserver(requestViewport);sizeObserver.observe(header);sizeObserver.observe(mobileBar);sizeObserver.observe(tableSelectionBar);sizeObserver.observe(workspace);
  document.body.classList.add('word-focus-mode');relocate();display();update();viewportChanged();
  return {update,setPracticeGuide(guide){
    practiceGuide?.remove();practiceGuide=guide;
    if(guide){
      guide.classList.add('word-lesson-guide');
      guide.querySelector('.practice-instruction-button')?.addEventListener('click',()=>{
        if(media.matches&&sheetOpen)dismiss();
      },true);
      quick.append(guide);
    }
  },dispose(){
    document.body.classList.remove('word-focus-mode');viewportVars.forEach(name=>document.body.style.removeProperty(name));
    host.removeEventListener('keydown',keyboard);host.removeEventListener('focusin',requestViewport);host.removeEventListener('focusout',requestViewport);
    media.removeEventListener('change',modeChanged);window.visualViewport?.removeEventListener('resize',requestViewport);window.visualViewport?.removeEventListener('scroll',requestViewport);window.removeEventListener('resize',requestViewport);
    workspace.removeEventListener('pointerdown',collapseForDocument,true);sheet.removeEventListener('click',finishTool);
    sizeObserver.disconnect();cancelAnimationFrame(viewportFrame);
  }};
}
