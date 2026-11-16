import { el } from '../components/ui.js';
import { mediaClub } from './public-examples.js';
import { allTasks,loadTaskProgress } from './catalog.js';
import { formulaHTML,mathCSS } from '../modules/word/math.js';

const safety=()=>el('p',{className:'practice-guide-safety'},'Працюй із дозволу вчителя. Сиди зручно, роби перерви та дотримуйся правил безпеки в кабінеті.');
const steps=task=>el('ol',{},...task.instructions.map(text=>el('li',{},text)));

export function instructionView(task=mediaClub){
  if(task.customInstructions){
    const meta=[task.difficulty,task.duration].filter(Boolean).join(' · ');
    const view=el('section',{className:'practice-instruction'},el('h2',{},task.title),
      meta?el('p',{},meta):null,task.subtitle?el('p',{},task.subtitle):null,
      task.moduleId==='windows'?null:safety());
    if(task.moduleId==='windows'&&task.folder)view.append(el('p',{},`У «Документи» створи робочу папку «${task.folder}». Якщо така вже є, додай номер спроби. Працюй лише з матеріалами своєї роботи у віртуальній ОС.`));
    view.append(el('ol',{},...task.instructions.map(text=>el('li',{style:'white-space:pre-wrap'},text))));
    if(task.result)view.append(el('h3',{},'Очікуваний результат'),el('p',{style:'white-space:pre-wrap'},task.result));
    if(task.keepMaterials){
      if(task.source)view.append(el('a',{href:task.source,className:'button',target:'_blank',rel:'noopener'},'Відкрити оригінальний матеріал'));
      for(const src of task.pages||[])view.append(el('img',{src,loading:'lazy',className:'practice-source-page',alt:'Зразок до завдання'}));
      for(const [label,source] of task.formulas||[]){const formula=el('div',{className:'practice-formula'});formula.innerHTML=formulaHTML(source);view.append(el('p',{},label),el('style',{},mathCSS),formula);}
      if(task.sampleTable){
        const {caption,columns,rows}=task.sampleTable;
        const cell='padding:.3rem .5rem;border:1px solid var(--line);text-align:start';
        view.append(el('div',{style:'overflow-x:auto'},el('table',{style:'border-collapse:collapse;width:100%'},
          el('caption',{style:'padding:.5rem;text-align:start;font-weight:700'},caption),
          el('thead',{},el('tr',{},...columns.map(value=>el('th',{scope:'col',style:cell},value)))),
          el('tbody',{},...rows.map(row=>el('tr',{},...row.map(value=>el('td',{style:cell},value))))))));
      }
    }
    if(task.attachments?.length)view.append(el('h3',{},'Матеріали'),...task.attachments.map(a=>el('div',{className:'practice-material'},el('a',{className:'button',href:a.data,download:a.name},'↓ '+a.name),a.type.startsWith('image/')?el('img',{src:a.data,loading:'lazy',alt:a.name,className:'practice-source-page'}):null)));
    return view;
  }
  if(task.moduleId==='windows')return el('section',{className:'practice-instruction'},
    el('h2',{},task.title),el('p',{},`${task.difficulty} рівень · ${task.duration}`),
    el('p',{},`Працюй лише у віртуальній ОС. У «Документи» створи власну робочу папку «${task.folder}». Якщо така вже є, додай до назви номер спроби. Усі наступні дії виконуй у цій папці, якщо не зазначено інше. Не змінюй матеріали інших робіт.`),
    steps(task),el('h3',{},'Що має вийти'),el('p',{},task.result),
    el('p',{},'Робота зберігається на віртуальному диску цього браузера. Для показу вчителю відкрий потрібну папку.'));
  if(task.moduleId==='browser'||task.id==='text-3')return el('section',{className:'practice-instruction'},el('h2',{},task.title),safety(),steps(task));
  if(task.pages)return el('section',{className:'practice-instruction'},
    el('h2',{},task.title),safety(),el('p',{},'Використай значення зі зразка в підручнику.'),steps(task),
    el('h3',{},'Зразок із підручника'),
    el('a',{className:'button',href:task.source,target:'_blank',rel:'noopener'},'Відкрити PDF'),
    ...task.pages.map((src,i)=>el('img',{className:'practice-source-page',src,loading:'lazy',alt:`Оригінальне завдання, сторінка ${i+1}. ${i===0?'Зразок таблиці та початок роботи.':'Вимоги до шрифту, розмірів, меж, заливки та збереження.'}`})));

  const formulas=el('div',{className:'practice-instruction-formulas'});
  for(const [label,source] of task.formulas){const preview=el('div',{className:'practice-formula'});preview.innerHTML=formulaHTML(source);preview.firstElementChild.removeAttribute('role');preview.firstElementChild.removeAttribute('tabindex');formulas.append(el('p',{},label),preview);}
  return el('section',{className:'practice-instruction'},el('style',{},mathCSS),el('h2',{},task.title),safety(),
    el('ol',{},
      el('li',{},'Відкрийте файл-заготовку до практичної роботи.'),
      el('li',{},'Оформте текст у вигляді багаторівневого списку: абзаци синього кольору — I рівень, фіолетового — II рівень, зеленого — III рівень. Нумерація: I рівень — 1.; II рівень — 1); III рівень — 1.'),
      el('li',{},'Розмістіть текст останнього непорожнього абзацу у два стовпці однакової ширини — 7 см.'),
      el('li',{},'Створіть верхній колонтитул із назвою документа і сьогоднішньою датою, нижній колонтитул — із вашим прізвищем.'),
      el('li',{},'Збережіть документ під назвою «Практична робота 2.1» у «Мої файли» сайту.'),
      el('li',{},'Створіть новий текстовий документ. Уведіть формули за наведеним зразком:',formulas),
      el('li',{},'Збережіть другий документ під назвою «Практична робота 2.2» у «Мої файли» сайту.')));
}
export function instructionButton(task=mediaClub,{dock=false}={}){
  let modal;
  const trigger=el('button',{type:'button',className:'practice-instruction-button','aria-haspopup':'dialog','aria-expanded':'false',
    onPointerdown:e=>e.preventDefault(),onClick:()=>{
      if(modal.open){modal.close();return;}
      const side=dock&&matchMedia('(min-width:1024px)').matches;
      modal.classList.toggle('practice-instruction-side',side);
      if(side)modal.show();else modal.showModal();
      trigger.setAttribute('aria-expanded','true');
    }},'Інструкція');
  modal=el('dialog',{className:'practice-instruction-dialog','aria-label':'Інструкція: '+task.title},
    el('button',{type:'button',className:'practice-instruction-close',onClick:()=>modal.close()},'Закрити'),instructionView(task));
  modal.addEventListener('close',()=>trigger.setAttribute('aria-expanded',String(modal.open)));
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&modal.classList.contains('practice-instruction-side')){
      event.preventDefault();event.stopPropagation();modal.close();
    }
  });
  return el('div',{className:'practice-instruction-control'},trigger,modal);
}
export function practiceForFile(fileId){return fileId?allTasks.find(item=>loadTaskProgress(item).files.includes(fileId)):null;}
export function guideFor(fileId){const task=practiceForFile(fileId);return task?instructionButton(task,{dock:true}):null;}
