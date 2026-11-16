import { isHostedSite } from '../core/platform.js';

// Coordinates select the icon areas of the supplied illustration; labels stay real text.
export const menuArt = {
  windows:['Віртуальний ПК','Операційна система, робочий стіл і папки (аналог Windows)',30,35,240,210],
  files:['Мої файли','Робота з файлами',293,35,235,210],
  archiver:['Архіватор','Стиснення та розпакування файлів',548,35,233,210],
  settings:['Налаштування','Системні параметри',798,35,224,210],
  word:['Word','Текстовий редактор для документів',1038,35,226,210],
  excel:['Excel','Табличний редактор для обчислень і діаграм',1281,35,229,210],
  powerpoint:['PowerPoint','Редактор презентацій і показу слайдів',1527,35,230,210],
  access:['База даних','Робота з базами даних (аналог Access)',22,348,245,184],
  vector:['Векторний редактор','Створення векторної графіки (SVG)',283,348,244,184],
  raster:['Растровий редактор','Малювання пензлем, виділення та шари',283,348,244,184],
  animation:['Редактор анімацій','Створення 2D-анімацій (аналог Wick Editor)',541,348,241,184],
  scratch:['Блокове програмування','Створення проєктів у візуальному середовищі (аналог Scratch)',794,348,233,184],
  python:['Python','Код, бібліотеки та вікна Tkinter',1039,348,226,184],
  'three-d':['3D-редактор','Створення та редагування 3D-об’єктів (навчальний аналог Blender)',1280,348,240,184],
  audio:['Аудіоредактор','Запис та редагування звуку',1531,348,226,184],
  cloud:['Хмарне сховище','Зберігання та обмін файлами (навчальна симуляція)',24,642,278,154],
  browser:['Навчальний браузер','Навчальні сайти, пошук і закладки',331,642,275,154],
};

const badges={
  windows:['▦','#9bc8ff'],files:['▤','#ffd499'],archiver:['≡','#ffd499'],settings:['⚙','#a7bdde'],
  word:['W','#99c1ff'],excel:['X','#9be8b6'],powerpoint:['P','#ffb79f'],access:['A','#f5a9b8'],
  vector:['◇','#cab5ff'],raster:['▧','#f5aec9'],animation:['▷','#eab7ff'],
  scratch:['◫','#ffc77e'],python:['Py','#9ed8ff'],'three-d':['⬡','#c0bbff'],
  audio:['♫','#95e5df'],cloud:['☁','#abd2fa'],browser:['◎','#97ddff']
};

let requested=false;
function loadLocalArtwork(){
  if(requested||isHostedSite()||!globalThis.Image||!globalThis.document?.documentElement)return;
  requested=true;
  const sprite=new Image();
  sprite.onload=()=>document.documentElement.classList.add('catalog-sprite-loaded');
  sprite.src=new URL('../../public/images/classroom-menu.png',import.meta.url).href;
}

export function artStyle(id){
  loadLocalArtwork();
  const [,,x,y,w,h]=menuArt[id];
  const [glyph,color]=badges[id];
  return `--catalog-glyph:"${glyph}";--catalog-glyph-color:${color};--icon-ratio:${w/h};aspect-ratio:var(--catalog-art-aspect,${w}/${h});background-size:${1774/w*100}% ${887/h*100}%;background-position:${x/(1774-w)*100}% ${y/(887-h)*100}%;`;
}
