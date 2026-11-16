import { el,heading,download } from '../components/ui.js';
import { hostedSiteUrl,isHostedSite } from '../core/platform.js';

async function showConnection(content,links,{online=false,refresh}={}){
  const {qrcodegen}=await import('../vendor/qrcodegen.js');
  if(!content.isConnected)return;
  const select=online?null:el('select',{id:'connection-address','aria-label':'Адреса локальної мережі'},
    ...links.map(link=>el('option',{value:link.url},link.name+' — '+link.address)));
  const current=links.find(link=>link.address===location.hostname);
  if(select&&current)select.value=current.url;
  const picture=el('div',{className:'connection-qr'}),link=el('a',{className:'connection-url'});
  let svgText='';
  function render(){
    const url=select?.value||links[0].url,qr=qrcodegen.QrCode.encodeText(url,qrcodegen.QrCode.Ecc.MEDIUM),size=qr.size+8;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 '+size+' '+size);svg.setAttribute('role','img');
    svg.setAttribute('aria-label','QR-код для відкриття віртуального кабінету');
    svg.setAttribute('shape-rendering','crispEdges');
    const background=document.createElementNS(ns,'rect');
    background.setAttribute('width',String(size));background.setAttribute('height',String(size));background.setAttribute('fill','#fff');
    const path=document.createElementNS(ns,'path');let cells='';
    for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))cells+='M'+(x+4)+','+(y+4)+'h1v1h-1z';
    path.setAttribute('d',cells);path.setAttribute('fill','#000');svg.append(background,path);picture.replaceChildren(svg);
    svgText=new XMLSerializer().serializeToString(svg);link.href=url;link.textContent=url;
  }
  select?.addEventListener('change',render);
  content.replaceChildren(el('div',{className:'connection-layout'},picture,el('div',{className:'connection-controls'},
    el('p',{},online?'Відскануй код або перешли посилання, щоб відкрити сайт.':'Підключи телефон до мережі комп’ютера та відскануй код камерою.'),link,
    select?el('label',{for:'connection-address',className:'connection-network',hidden:links.length===1},el('span',{},'Мережа класу'),select):null,
    el('div',{className:'actions'},el('button',{type:'button',className:'primary',
      onClick:()=>download(new Blob([svgText],{type:'image/svg+xml'}),'Кабінет — QR.svg')},'Завантажити QR'),refresh?.()),
    online?null:el('details',{className:'connection-help'},el('summary',{},'Телефон не відкриває сайт?'),
      el('p',{},'Перевір спільну мережу та дозвіл Node.js у брандмауері для приватної мережі. Гостьовий Wi-Fi може блокувати зв’язок між пристроями. Після зміни мережі онови адреси.')))));
  render();
}

export async function connectionPage(root){
  const content=el('section',{className:'panel connection-panel'},el('p',{role:'status'},'Шукаємо адресу…'));
  const refresh=(label='Оновити адреси')=>el('button',{type:'button',onClick:()=>{
    root.replaceChildren();connectionPage(root);
  }},label);
  root.append(heading('','QR для учнів'),content);
  if(isHostedSite()){
    const url=hostedSiteUrl();
    try{await showConnection(content,[{url}],{online:true});}
    catch{
      if(content.isConnected)content.replaceChildren(el('h2',{},'QR-код недоступний'),el('a',{className:'connection-url',href:url},url));
    }
    return;
  }
  try{
    const response=await fetch('/api/local-network',{cache:'no-store'});
    if(!response.ok)throw new Error('network');
    const data=await response.json();
    if(!content.isConnected)return;
    if(!data.lan){
      content.replaceChildren(el('h2',{},'Увімкни доступ для класу'),
        el('ol',{},el('li',{},'У вікні сервера натисни ',el('kbd',{},'Ctrl+C'),'.'),el('li',{},'Запусти ',el('code',{},'start-lan.bat'),'.')),
        el('p',{},'QR-код відкриється автоматично.'));return;
    }
    if(!Array.isArray(data.links)||!data.links.length){
      content.replaceChildren(el('h2',{},'Мережеву адресу не знайдено'),el('p',{},'Перевір Wi-Fi або мережевий кабель.'),refresh());return;
    }
    await showConnection(content,data.links,{refresh});
  }catch{
    if(content.isConnected)content.replaceChildren(el('h2',{},'QR-код недоступний'),el('p',{},'Перезапусти сервер через start-lan.bat.'),refresh('Спробувати ще раз'));
  }
}
