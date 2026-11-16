import { el,download } from '../../components/ui.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { instructionButton,guideFor } from '../../practice/guide.js';
import { detectiveTask } from '../../practice/grade45-detective.js';
import { sites,pages,cases,decisions,simulationDate,pageAt,siteAt,searchPages } from './sites.js';
import { HOME,address,newTab,blankBrowser,browserBlob,readBrowser,reportText } from './model.js';
export function mount(root,{filesystem:fs,notify,fileId,rememberWork,resume}){
 let state=blankBrowser(),record,disposed=false,busy=false,view='site',loading=Promise.resolve();
 const host=el('section',{className:'learn-browser'}),tabs=el('div',{className:'lb-tabs',role:'tablist','aria-label':'Вкладки браузера'}),body=el('div',{className:'lb-body'});
 const getPosition=()=>({view,scrollTop:body.scrollTop});
 const status=el('span',{'aria-live':'polite',className:'lb-status'},'Зміни зберігаються в цьому браузері.');
 const name=el('input',{value:state.name,maxlength:120,'aria-label':'Назва роботи',onInput:updateName,onChange:()=>{updateName();name.value=state.name;}});
 const autosave=createAutosave(async()=>{
  const blob=browserBlob(state);
  record=await fs.saveFile({...record,name:state.name+'.browser.json',blob,moduleId:'browser'});
  rememberWork?.(record,{position:getPosition()});
 },(phase,error)=>{if(disposed)return;status.textContent={dirty:'Є зміни…',saving:'Зберігаємо…',saved:'Збережено в «Мої файли».'}[phase]||'Не збережено: '+storageError(error);},700);
 const button=(text,action,attrs={})=>el('button',{type:'button',onClick:action,...attrs},text);
 const iconButton=(text,label,fn)=>button(text,fn,{title:label,'aria-label':label,className:'lb-icon'});
 const current=()=>state.tabs.find(t=>t.id===state.active)||state.tabs[0],currentURL=()=>{const t=current();return t.history[t.index];};
 const title=url=>url===HOME?'Нова вкладка':url.startsWith('browser:search?')?'Пошук: '+new URLSearchParams(url.split('?')[1]).get('q'):pageAt(url)?.title||siteAt(url)?.name||'Сторінка недоступна';
 function dirty(){if(!disposed&&!busy)autosave.change();}
 function updateName(){
  const value=name.value.trim().replace(/[\\/\x00-\x1f]/g,' ').slice(0,120)||'Мій браузер';
  if(value!==state.name){state.name=value;dirty();}
 }
 function visit(url){state.visits=[{url,time:new Date().toISOString()},...state.visits].slice(0,100);}
 function navigate(value,separate=false){
  if(busy)return;const url=address(value);
  if(separate){if(state.tabs.length>=8){notify('Можна відкрити до 8 вкладок. Закрий одну з непотрібних.');return;}const tab=newTab(url);state.tabs.push(tab);state.active=tab.id;}
  else{const tab=current();if(tab.history[tab.index]!==url){tab.history=tab.history.slice(0,tab.index+1);tab.history.push(url);if(tab.history.length>100)tab.history.shift();tab.index=tab.history.length-1;}}
  visit(url);view='site';dirty();render();
 }
 function internalLink(label,url){const link=el('a',{href:'#',onClick:e=>{e.preventDefault();navigate(url,e.ctrlKey||e.metaKey);},onAuxclick:e=>{if(e.button===1){e.preventDefault();navigate(url,true);}}},label);return link;}
 function openLinkRow(label,url){return el('div',{className:'lb-source-link'},internalLink(label,url),button('↗',()=>navigate(url,true),{'aria-label':'Відкрити у новій навчальній вкладці: '+label,title:'Відкрити в новій вкладці'}));}
 function go(delta){const tab=current(),index=tab.index+delta;if(index<0||index>=tab.history.length)return;tab.index=index;view='site';dirty();render();}
 const back=iconButton('←','Назад',()=>go(-1)),forward=iconButton('→','Уперед',()=>go(1));
 const addressInput=el('input',{'aria-label':'Адреса навчального сайту або пошуковий запит',placeholder:'Адреса або пошук',autocomplete:'off',autocapitalize:'off',spellcheck:false});
 const addressForm=el('form',{className:'lb-address',onSubmit:e=>{e.preventDefault();addressInput.blur();navigate(addressInput.value||HOME);}},addressInput,el('button',{type:'submit','aria-label':'Перейти'},'Перейти'));
 const bookmark=iconButton('☆','Додати закладку',()=>{const url=currentURL();if(state.bookmarks.includes(url))state.bookmarks=state.bookmarks.filter(u=>u!==url);else{if(state.bookmarks.length>=40){notify('Збережено вже 40 закладок. Видали непотрібну.');return;}state.bookmarks.push(url);}dirty();renderChrome();});
 function renderChrome(){
  tabs.replaceChildren(...state.tabs.map(tab=>{const url=tab.history[tab.index],active=tab.id===state.active;
    const choose=button(title(url),()=>{state.active=tab.id;view='site';dirty();render();},{role:'tab','aria-selected':String(active),tabindex:active?0:-1,className:'lb-tab-name'});
    choose.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=state.tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?state.tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+state.tabs.length)%state.tabs.length;state.active=state.tabs[next].id;view='site';dirty();render();tabs.querySelector('[aria-selected=true]')?.focus();});
    return el('div',{className:'lb-tab'+(active?' is-active':'')},choose,iconButton('×','Закрити вкладку: '+title(url),()=>{const i=state.tabs.indexOf(tab);state.tabs.splice(i,1);if(!state.tabs.length)state.tabs.push(newTab());if(state.active===tab.id)state.active=state.tabs[Math.min(i,state.tabs.length-1)].id;dirty();render();}));
  }),iconButton('+','Нова вкладка',()=>navigate(HOME,true)));
  const tab=current();back.disabled=tab.index===0;forward.disabled=tab.index===tab.history.length-1;
  addressInput.value=currentURL();const marked=state.bookmarks.includes(currentURL());bookmark.textContent=marked?'★':'☆';bookmark.setAttribute('aria-pressed',String(marked));bookmark.title=marked?'Прибрати закладку':'Додати закладку';bookmark.setAttribute('aria-label',bookmark.title);
  for(const control of viewButtons)control.setAttribute('aria-pressed',String(control.dataset.view===view));
 }
 function home(){return el('section',{className:'lb-home'},el('p',{className:'lb-eyebrow'},'ДОСЛІДЖУЙ · ПОРІВНЮЙ · РОБИ ВИСНОВКИ'),el('h1',{},'Навчальна мережа'),el('p',{},'Відкрий сайт або введи запит в адресному рядку. Тут можна тренуватися без інтернету.'),el('h2',{},'Інформаційний детектив'),el('div',{className:'lb-cases'},...cases.map((c,i)=>el('article',{},el('span',{className:'lb-case-number'},String(i+1).padStart(2,'0')),el('h3',{},c.title),el('p',{},c.claim),button('Дослідити повідомлення',()=>navigate(c.url))))),el('h2',{},'Сайти навчальної мережі'),el('div',{className:'lb-site-directory'},...sites.map(site=>el('article',{},el('span',{className:'lb-site-mark '+site.theme},site.mark),el('h3',{},site.name),el('p',{},site.host),button('Відкрити сайт',()=>navigate('https://'+site.host))))));}
 function search(query){const found=searchPages(query);return el('section',{className:'lb-results'},el('h1',{},'Пошук у навчальній мережі'),el('p',{},`Запит: «${query}». Знайдено сторінок: ${found.length}. Порядок результатів залежить від слів запиту, а не від достовірності.`),...found.map(p=>el('article',{},el('small',{},p.url),openLinkRow(p.title,p.url),el('p',{},p.lead||p.paragraphs[0]))),!found.length?el('p',{},'Спробуй інші слова: школа, уроки, папір, екоклуб, музей.'):null);}
 function website(url){
  const page=pageAt(url),site=siteAt(url);
  if(!site)return el('section',{className:'lb-empty'},el('h1',{},'Ця адреса поза навчальною мережею'),el('p',{},'Цей модуль відкриває вигадані локальні сайти .test. Зовнішні сайти тут не завантажуються.'),button('До навчальних сайтів',()=>navigate(HOME)));
  const nav=el('nav',{'aria-label':'Навігація сайту'},internalLink('Головна','https://'+site.host),internalLink('Про нас',site.about));
  const header=el('header',{className:'lb-site-header'},el('div',{},el('span',{className:'lb-site-mark'},site.mark),el('strong',{},site.name)),el('p',{},site.tagline),nav);
  let content;
  if(!page&&url==='https://'+site.host)content=el('section',{className:'lb-articles'},el('h1',{},'Останні публікації'),...pages.filter(p=>siteAt(p.url)===site&&p.url!==site.about).map(p=>el('article',{},el('small',{},p.date||''),openLinkRow(p.title,p.url),el('p',{},p.lead||p.paragraphs[0]))));
  else if(!page)content=el('section',{},el('h1',{},'Такої сторінки на цьому сайті немає'),internalLink('На головну сайту','https://'+site.host));
  else{
    content=el('article',{className:'lb-article'},el('p',{className:'lb-eyebrow'},page.category||''),el('h1',{},page.title),page.author?el('p',{className:'lb-byline'},'Автор: '+page.author):null,page.date?el('p',{className:'lb-byline'},'Опубліковано: '+page.date):null,page.lead?el('p',{className:'lb-lead'},page.lead):null,...page.paragraphs.map(text=>el('p',{},text)));
    if(page.table)content.append(el('div',{className:'lb-data-scroll'},el('table',{},el('caption',{},page.title),el('thead',{},el('tr',{},...page.table.headers.map(text=>el('th',{scope:'col'},text)))),el('tbody',{},...page.table.rows.map(row=>el('tr',{},...row.map(text=>el('td',{},text))))))));
    if(page.aside)content.append(el('aside',{},page.aside));
    if(page.links?.length)content.append(el('section',{className:'lb-references'},el('h2',{},'Посилання'),...page.links.map(([text,href])=>openLinkRow(text,href))));
  }
  return el('div',{className:'lb-website '+site.theme},header,content,el('footer',{},site.name+' · ',internalLink('Про нас',site.about)));
 }
 function listing(kind){const history=kind==='history',items=history?state.visits:state.bookmarks.map(url=>({url}));return el('section',{className:'lb-results'},el('h1',{},history?'Історія переглядів':'Закладки'),history?el('p',{},'Час перегляду показано за годинником твого пристрою. Дати публікацій належать до вигаданого світу завдання.'):null,!items.length?el('p',{},history?'Переглянуті сторінки з’являться тут.':'Натисни зірочку біля адреси, щоб зберегти сторінку.'):null,...items.map((item,i)=>el('article',{},openLinkRow(title(item.url),item.url),el('small',{},item.url),item.time?el('p',{},Number.isNaN(Date.parse(item.time))?'':new Date(item.time).toLocaleString('uk-UA')):null,button('Прибрати',()=>{if(history)state.visits.splice(i,1);else state.bookmarks.splice(i,1);dirty();render();}))),items.length?button(history?'Очистити історію':'Очистити закладки',()=>{if(!confirm(history?'Очистити історію переглядів? Відповіді залишаться.':'Прибрати всі закладки? Відповіді залишаться.'))return;if(history)state.visits=[];else state.bookmarks=[];dirty();render();}):null);}
 function answers(){
  const section=el('section',{className:'lb-report'},el('h1',{},'Мої висновки'),el('p',{},'Запиши свої висновки та докази. Це твоя робота; автоматичної оцінки тут немає.'));
  for(const c of cases){const answer=state.answers[c.id];
    const field=(label,key,multiline=false)=>{const control=el(multiline?'textarea':'input',{'aria-label':`${c.title}: ${label}`,maxlength:key==='reason'?3000:key==='sources'?2000:key==='author'?300:150,...(multiline?{rows:3}:{}),onInput:e=>{answer[key]=e.target.value;dirty();}});control.value=answer[key];return {node:el('label',{},el('span',{},label),control),control};};
    const author=field('Автор або організація', 'author'),date=field('Дата повідомлення','date'),sources=field('Адреси джерел, з якими порівняно повідомлення','sources',true),reason=field('Мій висновок і докази: чому я так думаю?','reason',true);
    const choice=el('select',{'aria-label':`${c.title}: висновок`,onChange:e=>{answer.decision=e.target.value;dirty();}},el('option',{value:''},'Обери висновок'),...decisions.map(d=>el('option',{value:d},d)));choice.value=answer.decision;
    section.append(el('article',{className:'lb-answer-card'},el('h2',{},c.title),el('p',{},c.claim),button('Відкрити повідомлення',()=>navigate(c.url)),el('div',{className:'lb-answer-meta'},author.node,date.node),el('label',{},el('span',{},'Результат перевірки'),choice),sources.node,button('Додати адресу поточної вкладки',()=>{const url=currentURL();if(!url.startsWith('https://')||!siteAt(url)){notify('Спочатку відкрий сторінку одного з навчальних сайтів.');return;}const lines=answer.sources.split('\n');if(!lines.includes(url)){const value=[answer.sources,url].filter(Boolean).join('\n');if(value.length>2000){notify('Поле джерел заповнене. Скороти список.');return;}answer.sources=value;sources.control.value=value;dirty();}}),reason.node));
  }
  section.append(button('Експортувати висновки TXT',exportReport));return section;
 }
 function render(){if(disposed)return;renderChrome();const url=currentURL();body.replaceChildren(view==='answers'?answers():view==='history'||view==='bookmarks'?listing(view):url===HOME?home():url.startsWith('browser:search?')?search(new URLSearchParams(url.split('?')[1]).get('q')||''):website(url));body.scrollTop=0;}
 async function save(){try{if(!record&&!autosave.dirty())autosave.change();await autosave.flush();}catch(error){notify(storageError(error));}}
 function exportReport(){download(new Blob([reportText(state)],{type:'text/plain;charset=utf-8'}),state.name+' — висновки.txt');}
 const fileInput=el('input',{type:'file',accept:'.browser.json,.json',hidden:true,onChange:async e=>{const file=e.target.files[0];e.target.value='';if(!file||busy)return;try{await autosave.flush();busy=true;host.inert=true;const next=await readBrowser(file);if(disposed)return;state=next;record=undefined;name.value=state.name;view='site';busy=false;dirty();render();}catch(error){notify(error.message);}finally{busy=false;host.inert=false;}}});
 const viewButtons=[['site','Сайт'],['answers','Мої висновки'],['bookmarks','Закладки'],['history','Історія']].map(([key,label])=>{const control=button(label,()=>{view=key;render();},{'aria-pressed':String(key===view)});control.dataset.view=key;return control;});
 const menu=el('details',{className:'lb-menu'},el('summary',{},'Файл'),button('Зберегти',save),button('Відкрити проєкт',()=>fileInput.click()),button('Експорт проєкту',()=>download(browserBlob(state),state.name+'.browser.json')),button('Експорт висновків TXT',exportReport));
 host.append(el('header',{className:'lb-app-header'},el('a',{className:'button',href:'#catalog','aria-label':'До каталогу'},'←'),el('strong',{},'Браузер'),name,guideFor(fileId)||instructionButton({...detectiveTask,grade:'4–5'}),menu),tabs,el('div',{className:'lb-navigation'},back,forward,iconButton('↻','Оновити навчальну сторінку',()=>{view='site';render();}),iconButton('⌂','Початкова сторінка',()=>navigate(HOME)),addressForm,bookmark),el('div',{className:'lb-environment'},'Навчальна мережа · усі сайти й персонажі вигадані · дата у завданні: '+simulationDate),el('nav',{className:'lb-views','aria-label':'Інструменти дослідження'},...viewButtons),body,el('div',{className:'lb-bottom'},status),fileInput);
 menu.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});
 host.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}});
 function viewport(){host.style.height=(window.visualViewport?.height||window.innerHeight)+'px';}
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
 document.body.classList.add('browser-focus-mode');root.append(host);viewport();render();
 function leave(e){if(autosave.dirty()||busy){e.preventDefault();e.returnValue='';}}window.addEventListener('beforeunload',leave);
 if(fileId){
  busy=true;host.inert=true;
  loading=(async()=>{
   try{
    const file=await fs.getFile(fileId);
    if(!file)throw new Error('Файл уже видалено.');
    const next=await readBrowser(file.blob);
    if(disposed)return;
    state=next;record=file;name.value=state.name;status.textContent='Роботу відкрито.';
    const position=resume?.position;
    if(viewButtons.some(button=>button.dataset.view===position?.view))view=position.view;
    render();
    if(Number.isFinite(position?.scrollTop))body.scrollTop=position.scrollTop;
    rememberWork?.(file,{position:getPosition()});
   }catch(error){if(!disposed)notify(error.message);}
   finally{busy=false;if(!disposed)host.inert=false;}
  })();
 }
 return {
  getResumePosition(id){if(record?.id===id)return getPosition();},
  async canLeave(){await loading;if(busy){notify('Дочекайся відкриття файлу.');return false;}try{await autosave.flush();return true;}catch{return confirm('Зміни не збережено. Вийти й втратити їх?');}},
  dispose(){disposed=true;autosave.dispose();document.body.classList.remove('browser-focus-mode');window.removeEventListener('beforeunload',leave);window.visualViewport?.removeEventListener('resize',viewport);window.removeEventListener('resize',viewport);}
 };
}
