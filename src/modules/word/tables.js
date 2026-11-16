import { formatCells } from './text-format.js';
import { el } from '../../components/ui.js';
import { wordMobileMedia } from './mobile-editing.js';
export function tableControls({editor,getCell,getPageWidth,changed,notify,onSelectionChange}){
  const phone=matchMedia(wordMobileMedia);
  let active=null,gesture=null,suppressClickUntil=0,lastPointerType='',touchSelection=null;
  const selected=new Set();
  const current=()=>[...selected].find(c=>editor.contains(c))||getCell();
  function clear(){for(const c of selected)c.removeAttribute('data-word-selected-cell');selected.clear();}
  function cellAt(target){const cell=target?.closest?.('td,th');return cell&&editor.contains(cell)?cell:null;}
  function selectRectangle(first,last){
    const table=first.closest('table'),a=first.getBoundingClientRect(),b=last.getBoundingClientRect();
    const left=Math.min(a.left,b.left),right=Math.max(a.right,b.right),top=Math.min(a.top,b.top),bottom=Math.max(a.bottom,b.bottom);
    clear();
    for(const row of table.rows)for(const cell of row.cells){
      const r=cell.getBoundingClientRect();
      if(r.right>left+.5&&r.left<right-.5&&r.bottom>top+.5&&r.top<bottom-.5){selected.add(cell);cell.setAttribute('data-word-selected-cell','true');}
    }
    sync();
  }
  function start(e){
    if(e.isPrimary===false||e.button!==0||editor.contentEditable==='false')return;
    lastPointerType=e.pointerType;
    if(touchSelection||(phone.matches&&e.pointerType==='touch'))return;
    suppressClickUntil=0;clear();
    const cell=cellAt(e.target);
    gesture=cell?{id:e.pointerId,first:cell,last:cell,dragged:false}:null;
    sync();
    // A simple click still uses the browser's normal text caret.
  }
  function move(e){
    if(!gesture||gesture.id!==e.pointerId)return;
    const cell=cellAt(document.elementFromPoint(e.clientX,e.clientY));
    if(!editor.contains(gesture.first)){finish(e);return;}
    if(cell&&cell.closest('table')===gesture.first.closest('table')&&(cell!==gesture.first||gesture.dragged)){
      if(!gesture.dragged){gesture.dragged=true;editor.classList.add('is-dragging-cells');}
      if(gesture.last!==cell||!selected.size){gesture.last=cell;selectRectangle(gesture.first,cell);}
    }
    if(gesture.dragged){if(e.cancelable)e.preventDefault();getSelection()?.removeAllRanges();}
  }
  function finish(e){
    if(!gesture||gesture.id!==e.pointerId)return;
    const {first,dragged}=gesture;gesture=null;editor.classList.remove('is-dragging-cells');
    if(dragged){
      suppressClickUntil=Date.now()+600;
      if(e.cancelable)e.preventDefault();
      // Keep ribbon row/column actions anchored to the beginning of the selection.
      if(editor.contains(first)){
        anchorSelection(first);
        if(e.pointerType==='touch'&&editor.contains(document.activeElement))document.activeElement.blur();
      }
    }
    sync();
  }
  function anchorSelection(first){
    const range=document.createRange();range.selectNodeContents(first);range.collapse(true);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    onSelectionChange?.();
  }
  function click(e){
    if(touchSelection&&editor.contentEditable!=='false'){
      e.preventDefault();e.stopImmediatePropagation();
      const cell=cellAt(e.target);
      if(!cell)return;
      const first=touchSelection.first;
      if(!first){
        touchSelection.first=cell;
        selectRectangle(cell,cell);anchorSelection(cell);
      }else if(cell.closest('table')===first.closest('table')){
        touchSelection=null;
        selectRectangle(first,cell);anchorSelection(first);
      }
      return;
    }
    if(phone.matches&&lastPointerType==='touch'){
      if(selected.size){clear();sync();}
    }else if(Date.now()<suppressClickUntil){
      e.preventDefault();e.stopImmediatePropagation();
    }
  }
  function selectStart(e){if(gesture?.dragged||touchSelection)e.preventDefault();}
  editor.addEventListener('pointerdown',start,true);editor.addEventListener('click',click,true);editor.addEventListener('selectstart',selectStart);
  document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);
  const root=el('div',{className:'word-table-controls'}),message=el('p',{className:'word-table-context'},'Торкнися потрібної комірки в документі.');
  function cancelTouchSelection(){touchSelection=null;clear();sync();onSelectionChange?.();}
  function mobileModeChanged(){if(!phone.matches&&touchSelection)cancelTouchSelection();else sync();}
  const selectionHint=el('span',{role:'status'});
  const selectionBar=el('div',{className:'word-table-selection-bar',hidden:true},selectionHint,
    el('button',{type:'button',onClick:cancelTouchSelection},'Скасувати'));
  const selectRange=el('button',{type:'button','data-close-sheet':'',onClick:()=>{
    clear();touchSelection={first:null};sync();onSelectionChange?.();
  }},'Вибрати діапазон');
  const clearRange=el('button',{type:'button',onClick:cancelTouchSelection},'Зняти виділення');
  const selectionActions=el('div',{className:'word-table-actions word-table-touch-actions',hidden:true},selectRange,clearRange);
  phone.addEventListener('change',mobileModeChanged);
  const body=el('div',{className:'word-table-settings'});
  const chosenCells=()=>{const cells=[...selected].filter(c=>editor.contains(c));return cells.length?cells:current()?[current()]:[];};
  const chosenRows=()=>[...new Set(chosenCells().map(c=>c.parentElement))];
  function target(){const cell=current();if(!cell?.isConnected){notify('Спочатку торкнися комірки таблиці.');return null;}return cell;}
  function apply(fn){const cell=target();if(!cell)return;fn(cell,cell.closest('table'));changed();sync();}
  function dimension(label,min,max,step,unit,handler){
    const slider=el('input',{type:'range',min,max,step,'aria-label':label}),number=el('input',{type:'number',min,max,step,'aria-label':label+' — точне значення'});
    const change=value=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max){notify(`Вкажи від ${min} до ${max} ${unit}.`);sync();return;}handler(n);};
    slider.addEventListener('input',()=>{number.value=slider.value;});slider.addEventListener('change',()=>change(slider.value));number.addEventListener('change',()=>change(number.value));
    return {node:el('label',{className:'word-table-dimension'},el('span',{},label),el('div',{},slider,number,el('small',{},unit))),set(n){if(!root.contains(document.activeElement)||![slider,number].includes(document.activeElement)){slider.value=n;number.value=n;}},disable(value){slider.disabled=value;number.disabled=value;}};
  }
  const tableWidth=dimension('Ширина таблиці',25,100,1,'%',n=>apply((cell,table)=>{const widths=columnSizes(table),total=widths.reduce((a,b)=>a+b,0);for(const row of table.rows)for(let i=0;i<row.cells.length;i++)row.cells[i].style.width=(100*widths[i]/total)+'%';table.style.width=n+'%';}));
  const columnWidth=dimension('Ширина вибраного стовпця',5,95,1,'%',n=>apply((cell,table)=>{
    if(!regular(table)){notify('Зміна стовпців доступна для таблиць без об’єднаних комірок.');return;}
    const cells=[...table.rows[0].cells],i=cell.cellIndex;
    const old=columnSizes(table),other=old.reduce((sum,w,j)=>sum+(j===i?0:w),0);
    for(const row of table.rows)for(let j=0;j<row.cells.length;j++)row.cells[j].style.width=(j===i?n:(100-n)*old[j]/other)+'%';
  }));
  const rowHeight=dimension('Мінімальна висота рядка',24,240,2,'px',n=>apply(()=>{for(const row of chosenRows())row.style.height=n+'px';}));
  function regular(table){const count=table.rows[0]?.cells.length;return count>1&&[...table.rows].every(r=>r.cells.length===count&&[...r.cells].every(c=>c.colSpan===1&&c.rowSpan===1));}
  const color=el('input',{type:'color',value:'#dbeafe','aria-label':'Власний колір заливки',onChange:e=>paint(e.target.value)});
  function paint(value){apply((cell,table)=>{
    const cells=selected.size?[...selected].filter(c=>editor.contains(c)):[cell];
    for(const c of cells){if(value)c.style.backgroundColor=value;else c.style.removeProperty('background-color');}
  });}
  const swatches=el('div',{className:'word-table-swatches'});
  for(const [value,title]of [['#ffffff','Біла'],['#dbeafe','Блакитна'],['#dcfce7','Зелена'],['#fef3c7','Жовта'],['#fce7f3','Рожева'],['#ede9fe','Бузкова'],['#e2e8f0','Сіра'],['#ffff00','Жовта яскрава'],['#00b0f0','Синя']])swatches.append(el('button',{type:'button',title,'aria-label':title+' заливка',style:`--swatch:${value}`,onPointerdown:e=>e.preventDefault(),onClick:()=>paint(value)}));
  const actions=el('div',{className:'word-table-actions'},el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:()=>apply((cell,table)=>{if(!regular(table)){notify('Потрібна таблиця без об’єднаних комірок.');return;}for(const row of table.rows)for(const c of row.cells)c.style.width=100/row.cells.length+'%';})},'Однакові стовпці'),el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:()=>apply(()=>{for(const row of chosenRows())row.style.removeProperty('height');})},'Автовисота рядка'));
  body.append(el('div',{className:'word-table-size'},tableWidth.node,columnWidth.node,rowHeight.node,actions),el('div',{className:'word-table-fill'},el('span',{},'Заливка вибраних комірок'),swatches,el('div',{className:'word-table-actions'},color,el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:()=>paint('')},'Без заливки'))));
  function cm(value,fallback=0){const n=parseFloat(value);return Number.isFinite(n)?value.endsWith('cm')?n:value.endsWith('mm')?n/10:value.endsWith('pt')?n*2.54/72:n*2.54/96:fallback;}
  function columnSizes(table){const cells=[...(table.rows[0]?.cells||[])],width=table.style.width.endsWith('%')?getPageWidth()*parseFloat(table.style.width)/100:cm(table.style.width,getPageWidth());return cells.map(c=>c.style.width.endsWith('%')?width*parseFloat(c.style.width)/100:cm(c.style.width,width/cells.length));}
  const columnCm=dimension('Ширина стовпців',.5,20,.1,'см',n=>apply((cell,table)=>{
    if(!regular(table)){notify('Точна ширина доступна для таблиці без об’єднаних комірок.');return;}
    const widths=columnSizes(table);for(const c of chosenCells())widths[c.cellIndex]=n;const total=widths.reduce((a,b)=>a+b,0);
    if(total>getPageWidth()+.01){notify('Таблиця виходить за поля аркуша. Спочатку зменш інші стовпці.');return;}
    table.style.width=total+'cm';for(const row of table.rows)for(let i=0;i<row.cells.length;i++)row.cells[i].style.width=widths[i]+'cm';
  }));
  const rowCm=dimension('Мінімальна висота рядків',.3,10,.1,'см',n=>apply(()=>{for(const row of chosenRows())row.style.height=n+'cm';}));
  const action=(label,fn)=>el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:()=>apply(fn)},label);
  function moveRows(direction){
    const rows=chosenRows().sort((a,b)=>a.rowIndex-b.rowIndex),set=new Set(rows);if(!rows.length)return;
    const table=rows[0].closest('table');
    if([...table.rows].some(row=>[...row.cells].some(c=>c.rowSpan>1))){notify('Переміщення рядків доступне без вертикально об’єднаних комірок.');return;}
    if(direction==='first'){
      const header=table.rows[0];if(set.has(header)){notify('Вибери рядки даних без заголовка.');return;}let after=header;for(const row of rows){after.after(row);after=row;}
    }else for(const row of direction==='down'?[...rows].reverse():rows){const other=direction==='down'?row.nextElementSibling:row.previousElementSibling;if(other?.tagName==='TR'&&!set.has(other)){if(direction==='down')other.after(row);else other.before(row);}}
  }
  const movement=el('div',{className:'word-table-actions'},action('Рядок ↑',()=>moveRows('up')),action('Рядок ↓',()=>moveRows('down')),action('Під заголовок',()=>moveRows('first')));
  const vertical=el('select',{'aria-label':'Вертикальне вирівнювання',onChange:e=>apply(()=>{for(const c of chosenCells())c.style.verticalAlign=e.target.value;})},...[["top","Зверху"],["middle","Посередині"],["bottom","Знизу"]].map(([value,text])=>el('option',{value},text)));
  const borderColor=el('input',{type:'color',value:'#ed7d31','aria-label':'Колір меж'}),borderSize=el('input',{type:'number',min:.5,max:6,step:.5,value:1.5,'aria-label':'Товщина меж, пт'}),borderStyle=el('select',{'aria-label':'Стиль меж'},...[["solid","Суцільна"],["double","Подвійна суцільна"],["dashed","Штрихова"],["dotted","Крапкова"],["none","Без меж"]].map(([value,text])=>el('option',{value},text)));
  const borderScope=el('select',{'aria-label':'Область меж'},el('option',{value:'table'},'Уся таблиця'),el('option',{value:'selected'},'Вибрані комірки'));
  const borders=action('Застосувати межі',(cell,table)=>{const size=Number(borderSize.value);if(!Number.isFinite(size)||size<.5||size>6){notify('Товщина меж: від 0,5 до 6 пт.');return;}const cells=borderScope.value==='table'?[...table.rows].flatMap(r=>[...r.cells]):chosenCells();for(const c of cells)c.style.border=`${size}pt ${borderStyle.value} ${borderColor.value}`;});
  const exact=el('details',{className:'word-table-exact'},el('summary',{},'Розміри в сантиметрах, межі та вирівнювання'),el('div',{className:'word-table-exact-grid'},columnCm.node,rowCm.node,el('label',{},'По вертикалі',vertical),action('По центру комірок',()=>{const cells=chosenCells();for(const c of cells)c.style.verticalAlign='middle';formatCells(cells,'justifyCenter');}),el('label',{},'Колір меж',borderColor),el('label',{},'Товщина, пт',borderSize),el('label',{},'Стиль',borderStyle),el('label',{},'Застосувати до',borderScope),borders));
  body.append(exact);
  root.append(message,selectionActions,movement,body);
  function sync(){const tableNodes=editor.querySelectorAll('table');for(const table of tableNodes){if(!regular(table))continue;const widths=columnSizes(table),sum=widths.reduce((a,b)=>a+b,0);for(const row of table.rows)for(let i=0;i<row.cells.length;i++)row.cells[i].style.setProperty('--mobile-column-width',(100*widths[i]/sum)+'%');}
    for(const c of selected)if(!editor.contains(c))selected.delete(c);
    if(touchSelection&&(editor.contentEditable==='false'||!tableNodes.length||(touchSelection.first&&!editor.contains(touchSelection.first)))){
      touchSelection=null;clear();
    }
    selectionActions.hidden=!phone.matches||!tableNodes.length;
    clearRange.hidden=!selected.size&&!touchSelection;
    selectionBar.hidden=!touchSelection;
    const hint=touchSelection?.first?'Торкнися протилежного кута в цій таблиці.':'Торкнися першої комірки діапазону.';
    if(touchSelection&&selectionHint.textContent!==hint)selectionHint.textContent=hint;
    const cell=current();if(active!==cell){active?.removeAttribute('data-word-active-cell');active=cell;if(active)active.setAttribute('data-word-active-cell','true');}
    body.inert=!cell;movement.inert=!cell;root.classList.toggle('no-table',!cell);
    if(!cell){
      message.textContent=phone.matches?'Торкнися комірки, щоб змінити її оформлення.':'Щоб вибрати комірки, протягни мишею від першої до останньої.';
      return;
    }
    const table=cell.closest('table');message.textContent=selected.size?`Вибрано комірок: ${selected.size}.`:`Рядок ${cell.parentElement.rowIndex+1}, стовпець ${cell.cellIndex+1}.`;
    columnCm.set(Math.round((columnSizes(table)[cell.cellIndex]||1)*100)/100);columnCm.disable(!regular(table));rowCm.set(Math.round(cm(cell.parentElement.style.height,cell.parentElement.getBoundingClientRect().height*2.54/96)*100)/100);if(document.activeElement!==vertical)vertical.value=cell.style.verticalAlign||'top';
    const widths=columnSizes(table),total=widths.reduce((a,b)=>a+b,0);tableWidth.set(Math.round(total/getPageWidth()*100));
    const width=table.rows[0]?.cells[cell.cellIndex]?.style.width;columnWidth.set(width?.endsWith('%')?Math.round(parseFloat(width)):Math.round(100*widths[cell.cellIndex]/total));columnWidth.disable(!regular(table));
    rowHeight.set(Math.max(24,Math.min(240,cm(cell.parentElement.style.height)*96/2.54||Math.round(cell.parentElement.getBoundingClientRect().height))));
  }
  return {root,selectionBar,hasCell:()=>Boolean(current()),sync,formatSelection(command,value){const cells=[...selected].filter(c=>editor.contains(c));return cells.length?formatCells(cells,command,value):false;},dispose(){clear();editor.removeEventListener('pointerdown',start,true);editor.removeEventListener('click',click,true);editor.removeEventListener('selectstart',selectStart);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true);phone.removeEventListener('change',mobileModeChanged);gesture=null;editor.classList.remove('is-dragging-cells');active?.removeAttribute('data-word-active-cell');}};
}
