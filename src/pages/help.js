import { el } from '../components/ui.js';
import { siteText } from '../core/content/index.js';
import { textFields } from '../core/content/schema.js';
import { isHostedSite } from '../core/platform.js';
import { artStyle } from './catalog-art.js';

export const helpSections=[
  ['Відкрити програму','Обери потрібну програму в каталозі. Доступні редактори відкриваються з карток.'],
  ['Додати файл або нотатку','У «Моїх файлах» натисни «Імпортувати» або «Нотатка». Торкнися файлу, щоб відкрити його.'],
  ['Перевірити збереження','Дочекайся напису «Збережено». Якщо сталася помилка, завантаж роботу на пристрій через меню редактора.'],
  ['Відновити роботи','Роботи зберігаються в браузері за поточною адресою сайту. Перед зміною пристрою або очищенням даних створи резервну копію в «Моїх файлах».'],
  ['Надіслати роботу','Експортуй готову роботу й прикріпи файл до завдання в Classroom. Для цього потрібен інтернет.'],
  ['Підключитися до класу','Відскануй QR і дочекайся відкриття редактора. Далі можна від’єднатися від Wi-Fi й працювати в цій вкладці. З каталогу повернися кнопкою «Продовжити роботу». Якщо закрив вкладку, підключися й відкрий ту саму адресу.']
];

const visuals=['windows','files','word','cloud','browser','scratch'];
const destinations=[
  ['До каталогу','#catalog'],['Мої файли','#files'],null,['Мої файли','#files'],
  ['Відкрити Classroom','https://classroom.google.com/'],['Відкрити QR','#connect']
];
const defaultIntro=textFields.find(([key])=>key==='help.intro')?.[2];
const onlineSharing=['Поділитися сайтом','Відкрий QR-код або перешли посилання. Роботи зберігаються в браузері на кожному пристрої.'];

export function help(root){
  const intro=siteText('help.intro');
  const topics=helpSections.map((section,index)=>{
    const [title,body]=index===5&&isHostedSite()?onlineSharing:section;
    const destination=destinations[index];
    const [label,href]=destination||[];
    const external=Boolean(href?.startsWith('https:'));
    return el('details',{className:'library-help-topic'},
      el('summary',{},
        el('span',{className:'library-art',style:artStyle(visuals[index]),'aria-hidden':'true'}),
        el('span',{},siteText('help.'+index+'.title',title)),
        el('span',{className:'library-disclosure','aria-hidden':'true'})),
      el('div',{className:'library-help-answer'},
        el('p',{},siteText('help.'+index+'.body',body)),
        destination?el('a',{className:'button',href,target:external?'_blank':null,rel:external?'noopener noreferrer':null},label):null));
  });
  root.append(el('section',{className:'library-page library-help'},
    el('h1',{},siteText('help.title')),
    intro&&intro!==defaultIntro?el('p',{className:'library-help-intro'},intro):null,
    el('div',{className:'library-help-topics'},...topics)));
}
