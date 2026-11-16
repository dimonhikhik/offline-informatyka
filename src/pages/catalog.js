import { categories,modules } from '../core/module-registry/index.js';
import { textFields } from '../core/content/schema.js';
import { siteText } from '../core/content/index.js';
import { el } from '../components/ui.js';
import { artStyle,menuArt } from './catalog-art.js';

const categoryLabels=['Усі','Система','Офіс','Код','Графіка','Медіа','Інтернет'];
const excluded=new Set(['archiver','files','settings','cloud']);
const catalogDefaults=new Map(textFields.map(([key,,value])=>[key,value]));
const moduleNotes={
  windows:'Файли віртуального диска зберігаються окремо від «Моїх файлів».',
  browser:'Відкриває локальні навчальні сайти.'
};

function customText(key) {
  const value=siteText(key).trim();
  return value===catalogDefaults.get(key)?'':value;
}

function makeItem(id) {
  const module=modules.find(item=>item.id===id);
  const [name,description]=menuArt[id]||[module?.name,module?.description];
  const available=Boolean(module?.entry);
  return {
    ...module,id,available,
    name:siteText(`module.${id}.name`,name).trim()||name,
    description:siteText(`module.${id}.description`,description).trim(),
    defaultDescription:description,
    category:module?.category||categories[1],
    href:available?`#editor/${id}`:`#module/${id}`,
    color:module?.color||'#f3cb72'
  };
}

function artwork(item) {
  const art=menuArt[item.id]
    ?el('span',{className:'catalog-art',style:artStyle(item.id)})
    :el('span',{className:'catalog-art-fallback'},item.icon||'▦');
  return el('div',{className:'catalog-frame',style:`--app-tint:${item.color}`,'aria-hidden':'true'},art);
}

function programCard(item,showStatus=false) {
  const main=el('a',{className:'catalog-program-link',href:item.href},
    artwork(item),
    el('div',{className:'catalog-program-meta'},
      el('strong',{},item.name),
      showStatus&&!item.available?el('span',{className:'catalog-card-state'},'У розробці'):null));
  const info=item.available
    ?el('a',{className:'catalog-about',href:`#module/${item.id}`,title:`Про програму «${item.name}»`},
      el('span',{'aria-hidden':'true'},'i'),el('span',{className:'catalog-sr'},`Про програму «${item.name}»`))
    :null;
  return el('article',{className:'catalog-tile'},main,info);
}

export function catalog(root,latestWork) {
  const items=Object.keys(menuArt).filter(id=>!excluded.has(id)).map(makeItem);
  const resume=el('div',{className:'catalog-resume-slot',hidden:true});
  let current=0,query='';
  const list=el('div',{className:'catalog-grid'});
  const planned=el('div',{className:'catalog-grid'});
  const more=el('details',{className:'catalog-pending'},el('summary',{},'У розробці'),planned);
  const status=el('span',{className:'catalog-sr','aria-live':'polite'});
  const search=el('input',{className:'catalog-search-input',type:'search',
    placeholder:'Пошук програм','aria-label':'Пошук програм',onInput:event=>{
      query=event.target.value.trim().toLocaleLowerCase('uk');
      render();
    }});
  const filters=el('div',{className:'catalog-filters',role:'group','aria-label':'Категорії програм'},
    ...categories.map((name,index)=>el('button',{className:'catalog-chip',type:'button','aria-label':name,
      onClick:()=>{current=index;render();}},categoryLabels[index]||name)));
  const hero=customText('catalog.hero');
  const title=siteText('catalog.title').trim()||'Каталог програм';
  const note=customText('catalog.note');
  root.append(
    resume,
    el('section',{className:'catalog-hero'},el('div',{className:'catalog-hero-content'},
      el('h1',{},hero||title),
      el('a',{className:'button primary catalog-hero-action',href:'#practice'},'Практичні роботи',
        el('span',{'aria-hidden':'true'},'↗')))),
    el('section',{className:'catalog-programs','aria-label':title},
      hero&&hero!==title&&customText('catalog.title')?el('h2',{className:'catalog-custom-title'},title):null,
      el('div',{className:'catalog-toolbar'},el('div',{className:'catalog-search'},search),filters),
      note?el('p',{className:'catalog-note'},note):null,status,list,more)
  );
  render();
  latestWork?.then(work=>{
    if(!work||!resume.isConnected)return;
    const item=items.find(item=>item.id===work.moduleId);
    if(!item)return;
    const fileName=work.name?.replace(/\.(?:word|sheets|slides|browser|raster|python)\.json$/i,'');
    const href=`#editor/${item.id}${work.fileId?'/'+work.fileId:''}`;
    resume.append(el('a',{className:'catalog-resume',href},
      el('span',{className:'catalog-resume-art','aria-hidden':'true'},
        el('span',{className:'catalog-art',style:artStyle(item.id)})),
      el('span',{className:'catalog-resume-copy'},el('strong',{},'Продовжити роботу'),
        el('span',{},fileName?`${item.name} · ${fileName}`:item.name)),
      el('span',{className:'catalog-resume-arrow','aria-hidden':'true'},'→')));
    resume.hidden=false;
  });

  function render() {
    const found=items.filter(item=>(!current||item.category===categories[current])&&[
      item.id,item.name,item.description,item.defaultDescription,item.category,...(item.supportedFormats||[]),...(item.plannedFormats||[])
    ].join(' ').toLocaleLowerCase('uk').includes(query));
    const browsing=!current&&!query;
    const available=found.filter(item=>item.available),upcoming=found.filter(item=>!item.available);
    list.replaceChildren(...(browsing?available:[...available,...upcoming]).map(item=>programCard(item,!browsing)));
    if(!found.length)list.append(el('p',{className:'catalog-empty'},'Нічого не знайдено. Спробуй іншу назву або категорію.'));
    more.hidden=!browsing||!upcoming.length;
    if(browsing&&!planned.childElementCount)planned.append(...upcoming.map(item=>programCard(item)));
    for(const [index,button] of [...filters.children].entries())button.setAttribute('aria-pressed',String(current===index));
    status.textContent=`Знайдено програм: ${found.length}`;
  }
}

export function modulePage(root,id) {
  const module=modules.find(item=>item.id===id);
  const back=el('a',{href:'#catalog',className:'catalog-back'},'← До каталогу');
  if(!module||excluded.has(id)){
    root.append(back,el('h1',{},'Програму не знайдено'));
    return;
  }
  const item=makeItem(id);
  const formats=item.available?item.supportedFormats:item.plannedFormats;
  const description=item.description!==item.defaultDescription?item.description:
    item.available?moduleNotes[id]:item.description;
  root.append(back,el('section',{className:'catalog-module'},
    artwork(item),
    el('div',{className:'catalog-module-content'},
      el('h1',{},item.name),
      item.available?null:el('p',{className:'catalog-module-state'},'У розробці'),
      description?el('p',{},description):null,
      formats?.length?el('div',{className:'catalog-formats','aria-label':item.available?'Формати':'Заплановані формати'},
        item.available?null:el('span',{className:'catalog-format-label'},'У плані'),
        ...formats.map(format=>el('span',{className:'catalog-format'},format))):null,
      item.available?el('a',{className:'button primary',href:item.href},'Відкрити',
        el('span',{'aria-hidden':'true'},'↗')):null)));
}
