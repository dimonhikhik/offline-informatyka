import { office,el,button,download,cleanName } from '../office/shared.js';
import { blank,read,newSheet,toXlsx,toCsv } from './model.js';
import { address,position,calculator,translate,column } from './formula.js';
export function mount(root,context){
  const app=office(root,context,{id:'excel',label:'Таблиці',blank,read,ext:'.sheets.json',accept:'.sheets.json,.xlsx,.csv'});
  const desktop=matchMedia('(min-width: 761px) and (pointer: fine), (min-width: 761px) and (pointer: none), (min-width: 1001px)');
  let active=0,start=[0,0],end=[0,0],clipboard,calc,dragging=false,filter='',pan=false;
  let pendingValue=false,restoreScroll;
  const sheet=()=>app.state.sheets[Math.min(active,app.state.sheets.length-1)];
  const range=()=>({r:Math.min(start[0],end[0]),c:Math.min(start[1],end[1]),er:Math.max(start[0],end[0]),ec:Math.max(start[1],end[1])});
  const each=fn=>{const a=range();for(let r=a.r;r<=a.er;r++)for(let c=a.c;c<=a.ec;c++)fn(address(r,c),r,c);};
  const cell=key=>sheet().cells[key]||(sheet().cells[key]={value:''});
  const selected=el('input',{'aria-label':'Комірка або діапазон',value:'A1',className:'sheet-address',onChange:goToAddress,onKeydown:event=>{
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault();goToAddress();scroller.focus({preventScroll:true});}
  }});
  function goToAddress(){
    try{
      const [a,b,extra]=selected.value.trim().toUpperCase().split(':');
      const p=position(a.trim()),q=position(b?.trim()||a.trim());
      if(extra!==undefined||[...p,...q].some(n=>n<0)||Math.max(p[0],q[0])>=sheet().rows||Math.max(p[1],q[1])>=sheet().cols)throw Error();
      start=p;end=q;paint();revealCell(start);
    }catch{
      app.notify('Введи адресу, наприклад A1 або A1:C5.');paint();
    }
  }
  const value=el('input',{'aria-label':'Вміст або формула',placeholder:'Текст, число або =SUM(A1:A5)',
    onInput:()=>{pendingValue=true;},onChange:commit,onBlur:commitPending,onKeydown:event=>{
      if(event.isComposing)return;
      if(event.key==='Escape'){
        event.preventDefault();pendingValue=false;
        value.value=sheet().cells[address(...start)]?.value||'';
        value.blur();
        if(desktop.matches)scroller.focus({preventScroll:true});
        return;
      }
      if(event.key!=='Enter'&&!(desktop.matches&&event.key==='Tab'))return;
      const next=desktop.matches?nextCell(event.key,event.shiftKey):null;
      if(event.key==='Tab'&&!next)return;
      event.preventDefault();commit();value.blur();
      if(next)selectCell(next);
      if(desktop.matches)scroller.focus({preventScroll:true});
    }});
  function commit(){
    pendingValue=false;
    const key=address(...start),v=value.value.slice(0,2000);
    if((sheet().cells[key]?.value||'')!==v)app.change(()=>cell(key).value=v);
  }
  function commitPending(){if(pendingValue)commit();}
  const formula=el('div',{className:'sheet-formula'},selected,el('span',{},'ƒx'),value,button('✓',()=>{commit();value.blur();},{'aria-label':'Застосувати введення'}));
  const scroller=el('div',{className:'sheet-scroll',tabindex:0,'aria-label':'Електронна таблиця'}),grid=el('table',{className:'sheet-grid',role:'grid'}),tabs=el('div',{className:'sheet-tabs'});scroller.append(grid);app.body.append(formula,scroller,tabs);
  function format(key,v){app.change(()=>each(id=>cell(id)[key]=v));}
  const opts=(label,choices,action)=>el('label',{},label,el('select',{onChange:e=>action(e.target.value)},...choices.map(([value,text])=>el('option',{value},text))));
  const formatTools=el('details',{},el('summary',{},'Формат'),el('div',{},button('Ж',()=>format('bold',!cell(address(...start)).bold),{title:'Жирний'}),button('К',()=>format('italic',!cell(address(...start)).italic),{title:'Курсив'}),el('label',{},'Заливка',el('input',{type:'color',value:'#fff2b2',onInput:e=>format('fill',e.target.value)})),el('label',{},'Текст',el('input',{type:'color',value:'#172033',onInput:e=>format('color',e.target.value)})),opts('Вирівнювання',[['left','Ліворуч'],['center','По центру'],['right','Праворуч']],v=>format('align',v)),opts('Числа',[['general','Загальний'],['number','2 десяткові'],['percent','Відсотки']],v=>format('format',v))));
  function copy(){
    const a=range(),rows=[];
    for(let r=a.r;r<=a.er;r++){
      const row=[];
      for(let c=a.c;c<=a.ec;c++)row.push(structuredClone(sheet().cells[address(r,c)]||{value:''}));
      rows.push(row);
    }
    const text=rows.map(row=>row.map(cell=>cell.value).join('\t')).join('\n');
    clipboard={r:a.r,c:a.c,rows,text};
    app.notify('Діапазон скопійовано.');
    return text;
  }
  function paste(rows,source){if(!rows?.length)return;const [r,c]=start;if(r+rows.length>sheet().rows||c+Math.max(...rows.map(a=>a.length))>sheet().cols){app.notify('Дані виходять за межі аркуша. Додай рядки чи стовпці.');return;}app.change(()=>rows.forEach((row,y)=>row.forEach((v,x)=>{const next=typeof v==='string'?{value:v.slice(0,2000)}:structuredClone(v);if(source&&next.value.startsWith('='))next.value=translate(next.value,r-source.r,c-source.c);sheet().cells[address(r+y,c+x)]=next;})));}
  function fill(){const a=range();if(a.r===a.er)return app.notify('Виділи вихідний рядок разом із рядками для заповнення.');app.change(()=>{for(let r=a.r+1;r<=a.er;r++)for(let c=a.c;c<=a.ec;c++){const v=structuredClone(sheet().cells[address(a.r,c)]||{value:''});if(v.value.startsWith('='))v.value=translate(v.value,r-a.r,0);sheet().cells[address(r,c)]=v;}});}
  function sort(desc){const a=range();if(a.r===a.er)return app.notify('Виділи рядки даних без заголовка. Сортування — за першим стовпцем виділення.');let formulaFound=false;each(k=>{if(sheet().cells[k]?.value.startsWith('='))formulaFound=true;});if(formulaFound)return app.notify('На цьому етапі сортуються тільки діапазони без формул.');app.change(()=>{const rows=[];for(let r=a.r;r<=a.er;r++){const row=[];for(let c=a.c;c<=a.ec;c++)row.push(structuredClone(sheet().cells[address(r,c)]||{value:''}));rows.push(row);}rows.sort((x,y)=>{const a=x[0].value,b=y[0].value;return (Number.isFinite(Number(a))&&Number.isFinite(Number(b))?Number(a)-Number(b):a.localeCompare(b,'uk',{numeric:true}))*(desc?-1:1);});rows.forEach((row,r)=>row.forEach((v,c)=>sheet().cells[address(a.r+r,a.c+c)]=v));});}
  function chart(){const a=range();if(a.ec-a.c<1||a.er-a.r>29)return app.notify('Виділи 2 стовпці: підписи й числа, до 30 рядків.');const rows=[];for(let r=a.r;r<=a.er;r++){const v=calc(address(r,a.c+1));if(typeof v==='number')rows.push([String(calc(address(r,a.c))),v]);}if(!rows.length)return app.notify('У другому стовпці немає чисел.');const max=Math.max(1,...rows.map(x=>Math.abs(x[1]))),dialog=el('dialog',{className:'office-dialog'},button('Закрити',()=>dialog.close()),el('h2',{},'Стовпчаста діаграма'),...rows.map(([label,v])=>el('div',{className:'sheet-chart-row'},el('span',{},label),el('div',{style:`width:${Math.abs(v)/max*100}%;background:${v<0?'#df655d':'#338eda'}`},String(v)))));dialog.addEventListener('close',()=>dialog.remove());app.host.append(dialog);dialog.showModal();}
  app.tools.append(button('Редагувати',()=>{value.focus();value.select();}),formatTools,el('details',{},el('summary',{},'Дані'),el('div',{},button('Копіювати',copy),button('Вставити',()=>clipboard?paste(clipboard.rows,clipboard):app.notify('Спочатку скопіюй діапазон.')),button('Заповнити вниз',fill),button('Очистити',()=>app.change(()=>each(k=>delete sheet().cells[k]))),button('Сортувати ↑',()=>sort(false)),button('Сортувати ↓',()=>sort(true)),el('input',{type:'search',placeholder:'Фільтр рядків…','aria-label':'Фільтр рядків за текстом',onInput:e=>{filter=e.target.value.toLocaleLowerCase('uk');renderGrid();}}))),button('Діаграма',chart),el('details',{},el('summary',{},'Аркуш'),el('div',{},button('+ Рядки',()=>app.change(()=>sheet().rows=Math.min(200,sheet().rows+25))),button('+ Стовпці',()=>app.change(()=>sheet().cols=Math.min(52,sheet().cols+5))),button('Перейменувати',()=>{const name=prompt('Назва аркуша',sheet().name);if(name){const clean=name.replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31);if(!clean||app.state.sheets.some(s=>s!==sheet()&&s.name.toLowerCase()===clean.toLowerCase()))return app.notify('Потрібна непорожня унікальна назва.');app.change(()=>sheet().name=clean);}}),button('Видалити аркуш',()=>{if(app.state.sheets.length>1&&confirm('Видалити поточний аркуш?'))app.change(()=>{app.state.sheets.splice(active,1);active=0;start=end=[0,0];});}))),button('XLSX',()=>app.run(async()=>download(await toXlsx(app.state),cleanName(app.state.name)+'.xlsx'))),button('CSV',()=>download(toCsv(sheet()),cleanName(sheet().name)+'.csv')));
  function paint(){
    const a=range(),[row,col]=start;
    selected.value=address(...start)+(row===end[0]&&col===end[1]?'':':'+address(...end));
    if(document.activeElement!==value)value.value=sheet().cells[address(...start)]?.value||'';
    for(const td of grid.querySelectorAll('td')){
      const r=Number(td.dataset.r),c=Number(td.dataset.c),inRange=r>=a.r&&r<=a.er&&c>=a.c&&c<=a.ec;
      td.classList.toggle('selected',inRange);
      td.classList.toggle('sheet-active-cell',r===row&&c===col);
      td.setAttribute('aria-selected',String(inRange));
    }
    for(const header of grid.querySelectorAll('th[data-r],th[data-c]')){
      header.classList.toggle('sheet-active-header',Number(header.dataset.r)===row||Number(header.dataset.c)===col);
    }
  }
  function renderGrid(){
    calc=calculator(sheet());
    const head=el('tr',{},el('th',{},''),...Array.from({length:sheet().cols},(_,c)=>el('th',{scope:'col','data-c':c},column(c))));
    const rows=[];
    for(let r=0;r<sheet().rows;r++){
      const values=Array.from({length:sheet().cols},(_,c)=>calc(address(r,c)));
      if(filter&&!values.some(v=>String(v).toLocaleLowerCase('uk').includes(filter)))continue;
      const cells=values.map((v,c)=>{
        const style=sheet().cells[address(r,c)]||{};
        const shown=typeof v==='number'?(style.format==='percent'?(v*100).toFixed(2)+'%':style.format==='number'?v.toFixed(2):String(Number(v.toPrecision(12)))):typeof v==='boolean'?(v?'TRUE':'FALSE'):v;
        return el('td',{'data-r':r,'data-c':c,style:`background:${style.fill||'#fff'};color:${style.color||'#172033'};font-weight:${style.bold?700:400};font-style:${style.italic?'italic':'normal'};text-align:${style.align||'left'}`,
          onDblclick:()=>{selectCell([r,c]);editCell();}},String(shown));
      });
      rows.push(el('tr',{},el('th',{scope:'row','data-r':r},String(r+1)),...cells));
    }
    grid.replaceChildren(el('thead',{},head),el('tbody',{},...rows));paint();
  }
  const panButton=button('↔ Прокрутка',()=>{pan=!pan;grid.classList.toggle('is-pan',pan);panButton.setAttribute('aria-pressed',String(pan));panButton.textContent=pan?'↔ Прокрутка ✓':'↔ Прокрутка';},
    {className:'sheet-pan-button','aria-pressed':'false',title:'На телефоні: перемикання між прокручуванням і виділенням пальцем'});app.tools.append(panButton);
  grid.addEventListener('pointerdown',e=>{const td=e.target.closest('td');if(!td||e.button!==0)return;if(document.activeElement===value)value.blur();const p=[+td.dataset.r,+td.dataset.c];if(!e.shiftKey)start=p;end=p;if(pan&&e.pointerType==='touch'){paint();return;}dragging=true;grid.setPointerCapture(e.pointerId);e.preventDefault();scroller.focus({preventScroll:true});paint();});
  grid.addEventListener('pointermove',e=>{if(!dragging)return;const td=document.elementFromPoint(e.clientX,e.clientY)?.closest('td');if(td&&grid.contains(td)){end=[+td.dataset.r,+td.dataset.c];paint();}});for(const type of ['pointerup','pointercancel','lostpointercapture'])grid.addEventListener(type,()=>dragging=false);
  function revealCell([r,c]){
    grid.querySelector('td[data-r="'+r+'"][data-c="'+c+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function selectCell(point,extend=false){
    end=point;
    if(!extend)start=[...end];
    paint();revealCell(end);
  }
  function editCell(append=false){
    value.focus();
    if(append)value.setSelectionRange(value.value.length,value.value.length);
    else value.select();
  }
  function nextCell(key,backwards,extend=false){
    const {rows,cols}=sheet(),[r,c]=extend?end:start,direction=backwards?-1:1;
    if(key==='Tab'){
      const next=r*cols+c+direction;
      return next<0||next>=rows*cols?null:[Math.floor(next/cols),next%cols];
    }
    if(key==='Home')return [r,0];
    const [dy,dx]=key==='Enter'?[direction,0]:
      ({ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[key]||[0,0]);
    return [Math.max(0,Math.min(rows-1,r+dy)),Math.max(0,Math.min(cols-1,c+dx))];
  }
  scroller.addEventListener('keydown',event=>{
    if(event.altKey||event.isComposing)return;
    const {key}=event,command=event.ctrlKey||event.metaKey;
    if(command){
      if(key==='Home'){event.preventDefault();selectCell([0,0],event.shiftKey);}
      return;
    }
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','Tab'].includes(key)||key==='Enter'&&desktop.matches){
      const extend=event.shiftKey&&key!=='Tab'&&key!=='Enter';
      const next=nextCell(key,event.shiftKey,extend);
      if(next){event.preventDefault();selectCell(next,extend);}
    }else if(key==='Enter'||key==='F2'){
      event.preventDefault();editCell(key==='F2');
    }else if(key==='Escape'){
      tabs.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    }else if(key==='Delete'){
      event.preventDefault();app.change(()=>each(k=>delete sheet().cells[k]));
    }else if(key.length===1){
      event.preventDefault();value.focus();value.value=key;pendingValue=true;
    }
  });
  scroller.addEventListener('copy',event=>{
    if(!event.clipboardData)return;
    event.clipboardData.setData('text/plain',copy());event.preventDefault();
  });
  const normalizeClipboard=text=>text.replace(/\r\n?/g,'\n').replace(/\n$/,'');
  scroller.addEventListener('paste',event=>{
    const incoming=event.clipboardData?.getData('text/plain');
    if(!incoming)return;
    event.preventDefault();
    const text=normalizeClipboard(incoming);
    if(clipboard&&normalizeClipboard(clipboard.text)===text)paste(clipboard.rows,clipboard);
    else paste(text.split('\n').map(row=>row.split('\t')));
  });
  function render(){
    active=Math.min(active,app.state.sheets.length-1);
    start=[Math.min(start[0],sheet().rows-1),Math.min(start[1],sheet().cols-1)];
    end=[Math.min(end[0],sheet().rows-1),Math.min(end[1],sheet().cols-1)];
    renderGrid();
    const sheetButtons=app.state.sheets.map((s,i)=>button(s.name,()=>{
      active=i;start=end=[0,0];filter='';render();
    },{'aria-pressed':i===active}));
    const addSheet=button('+ Аркуш',()=>{
      if(app.state.sheets.length>=10)return app.notify('Ліміт: 10 аркушів.');
      app.change(()=>{
        let n=1;while(app.state.sheets.some(s=>s.name===`Аркуш ${n}`))n++;
        app.state.sheets.push(newSheet(`Аркуш ${n}`));
        active=app.state.sheets.length-1;start=end=[0,0];
      });
    });
    tabs.replaceChildren(...sheetButtons,addSheet);
    if(restoreScroll){
      scroller.scrollLeft=restoreScroll.left;
      scroller.scrollTop=restoreScroll.top;
      restoreScroll=undefined;
    }
  }
  const cellPoint=point=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isInteger(n)&&n>=0)?point:[0,0];
  app.setRender(render,{
    getPosition:()=>({sheet:active,start:[...start],end:[...end],left:scroller.scrollLeft,top:scroller.scrollTop}),
    restorePosition:position=>{
      active=Number.isInteger(position.sheet)&&position.sheet>=0?position.sheet:0;
      start=cellPoint(position.start);end=cellPoint(position.end);
      restoreScroll={left:Number.isFinite(position.left)?position.left:0,top:Number.isFinite(position.top)?position.top:0};
    },
    commitPending
  });
  return app.lifecycle;
}
