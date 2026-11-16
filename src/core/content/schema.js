export const editorTypes={
  windows:'Операційна система',word:'Word',excel:'Excel',powerpoint:'PowerPoint',
  vector:'Векторний редактор',raster:'Растровий редактор',python:'Python',browser:'Навчальний браузер'
};
export const emptyContent=()=>({version:1,revision:0,texts:{},tasks:[]});
export const textFields=[
  ['site.title','Назва вкладки браузера','інформатика:офлайн'],
  ['catalog.hero','Заголовок головної','Віртуальний кабінет інформатики'],
  ['catalog.title','Назва каталогу','Каталог програм'],
  ['catalog.note','Опис під каталогом','Пиши документи, працюй із таблицями та презентаціями, малюй, збирай ZIP і досліджуй навчальні сайти. Частина редакторів ще розвивається.'],
  ['site.header','Оголошення над сторінкою',''],
  ['site.footer','Примітка внизу сторінки',''],
  ['practice.title','Заголовок практичних робіт','Практичні роботи'],
  ['practice.intro','Опис практичних робіт','Обери свій клас і практичну роботу.'],
  ['practice.welcome','Текст перед вибором класу','Для 4–6 класів є завдання з операційної системи різної складності. Для 4–5 — також дослідження сайтів, для 6 та 9 — роботи з текстовими документами.'],
  ['help.title','Заголовок довідки','Як це працює'],
  ['help.intro','Вступ до довідки','Твої роботи — в одному місці. Почнімо!']
];
export const attachmentTypes={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',csv:'text/csv',txt:'text/plain',zip:'application/zip'};
const bounded=(value,max,label)=>{if(typeof value!=='string'||value.length>max)throw Error('Неприпустиме поле: '+label);return value;};
export function validateContent(input){
  if(!input||input.version!==1||!Array.isArray(input.tasks)||input.tasks.length>200)throw Error('Непідтримуваний файл матеріалів (до 200 завдань).');
  const out=emptyContent();out.revision=Number.isSafeInteger(input.revision)&&input.revision>=0?input.revision:0;
  if(!input.texts||typeof input.texts!=='object'||Array.isArray(input.texts)||Object.keys(input.texts).length>100)throw Error('Неприпустимі тексти сайту.');
  const allowed=new Set(textFields.map(f=>f[0]));
  for(const [key,value] of Object.entries(input.texts)){
    if(!allowed.has(key)&&!/^module\.[a-z0-9-]+\.(name|description)$/.test(key)&&!/^help\.[0-5]\.(title|body)$/.test(key))throw Error('Невідомий текст: '+key);
    out.texts[key]=bounded(value,4000,key);
  }
  const ids=new Set();
  out.tasks=input.tasks.map(t=>{
    if(!t||!/^[-a-z0-9]{1,80}$/.test(t.id)||![4,5,6,7,8,9].includes(t.grade)||!Object.hasOwn(editorTypes,t.moduleId))throw Error('Перевір клас та програму завдання.');
    const key=t.grade+':'+t.id;if(ids.has(key))throw Error('Завдання повторюється: '+key);ids.add(key);
    const item={id:t.id,grade:t.grade,moduleId:t.moduleId,title:bounded(t.title,160,'назва').trim(),subtitle:bounded(t.subtitle||'',1000,'опис'),difficulty:bounded(t.difficulty||'',60,'складність'),duration:bounded(t.duration||'',60,'час'),folder:bounded(t.folder||'',100,'папка'),result:bounded(t.result||'',4000,'результат'),published:t.published!==false,keepMaterials:t.keepMaterials!==false,customInstructions:true};
    if(!item.title)throw Error('Введи назву завдання.');
    if(!Array.isArray(t.instructions)||t.instructions.length>100)throw Error('Завдання: до 100 пунктів.');
    item.instructions=t.instructions.map(v=>bounded(v,6000,'інструкція')).filter(v=>v.trim());
    if(item.published&&!item.instructions.length)throw Error('Додай хоча б один пункт завдання перед показом учням.');
    if(!Array.isArray(t.attachments||[])||(t.attachments||[]).length>10)throw Error('До завдання можна додати до 10 матеріалів.');
    item.attachments=(t.attachments||[]).map(a=>{
      const name=bounded(a.name,180,'назва матеріалу');const ext=name.split('.').pop().toLowerCase(),mime=attachmentTypes[ext];
      if(!mime||/[\\/\x00-\x1f]/.test(name)||typeof a.data!=='string'||a.data.length>7*1024*1024||!/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(a.data)||a.data.split(';')[0]!=='data:'+mime)throw Error('Неприпустимий матеріал: '+name);
      return {name,data:a.data,type:mime};
    });
    return item;
  });
  if(JSON.stringify(out).length>24*1024*1024)throw Error('Усі матеріали разом мають займати до 24 МБ у JSON.');
  return out;
}
