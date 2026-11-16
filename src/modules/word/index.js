import { mobileEditing } from './mobile-editing.js';
import { exactTextSize } from './text-format.js';
import { wrapColumnSelection } from './columns.js';
import { selectedBlocks,shiftBlocks } from './selection.js';
import { guideFor,practiceForFile } from '../../practice/guide.js';
import { styleColumns,updateListLabels,formattingCSS } from './formatting.js';
import { paginate } from './pages.js';
import { formulaHTML,mathCSS } from './math.js';
import { breakHTML,updateContents,structureCSS } from './structure.js';
import { tableControls } from './tables.js';
import { buildChrome } from './chrome.js';
import { createPracticeTools,objectStylesCSS } from './practice-tools.js';
import { createPracticeExchange } from './practice-exchange.js';
import { documentStyleCSS,paragraphStyleId,paragraphStyles,setParagraphStyle } from './styles.js';
import { el,download } from '../../components/ui.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { blank,cleanHTML,projectBlob,readProject,plainText,safeLink,escapeHTML,MAX_SIZE } from './model.js';
import { exportDocx } from './docx-export.js';
import { importDocx } from './docx-import.js';
import { printDocument } from './print.js';
export function mount(root,{filesystem:fs,notify,fileId,rememberWork,resume}){
  let chrome,tables,pages,mobile,exchange;
  const sourceId=resume?.practiceFileId||fileId;
  const practice=practiceForFile(sourceId);
  const dialogs=new Set();
  let doc=blank(),record,range=null,busy=false,disposed=false,undo=[],redo=[],lastInput=0,preview=false;
  let currentPracticeFileId,pendingPosition;
  let searchHit=null,searchOffset=0;
  const host=el('section',{className:'word-editor'});
  const editor=el('div',{className:'word-paper-body',contenteditable:'true',role:'textbox','aria-multiline':'true','aria-label':'Текст документа',spellcheck:true});editor.innerHTML=doc.html;
  const name=el('input',{value:'Мій документ','aria-label':'Назва документа',maxlength:150});
  const status=el('p',{className:'word-status','aria-live':'polite'},'Автозбереження ввімкнено.');
  const counter=el('span',{className:'muted','aria-live':'polite'});
  const headerView=el('div',{className:'word-page-header'}),footerView=el('div',{className:'word-page-footer'});
  const paper=el('article',{className:'word-paper'},headerView,editor,footerView);
  const workspace=el('div',{className:'word-workspace'},paper);
  function baseName(){const value=name.value.trim().replace(/(\.word\.json|\.docx|\.txt)$/i,'');if(!value||value.length>150||/[\\/\x00-\x1f]/.test(value))throw new Error('Назва: до 150 символів, без слешів.');return value;}
  function setStatus(state,message){status.dataset.state=state;status.textContent=message;}
  function rememberCurrentWork(){if(record&&!disposed)rememberWork?.(record,{practiceFileId:currentPracticeFileId});}
  const autosave=createAutosave(async()=>{
    const blob=projectBlob(doc),filename=baseName()+'.word.json';
    record=await fs.saveFile({...record,name:filename,blob,moduleId:'word'});
    rememberCurrentWork();
  },(state,error)=>{
    if(disposed)return;
    const messages={dirty:'Є зміни…',saving:'Зберігаємо…',saved:'Збережено в «Мої файли».'};
    setStatus(messages[state]?state:'error',messages[state]||`Не збережено. ${storageError(error)} Експортуй проєкт або DOCX, щоб залишити копію.`);
  },1000);
  function remember(){const selection=getSelection();if(selection?.rangeCount){const r=selection.getRangeAt(0);if(editor.contains(r.startContainer)&&editor.contains(r.endContainer))range=r.cloneRange();chrome?.update();tables?.sync();}}
  function rememberWhileEditing(){if(editor.contains(document.activeElement))remember();}
  function restore(){
    const selection=getSelection(),current=selection.rangeCount?selection.getRangeAt(0):null;
    if(range&&current&&editor.contains(document.activeElement)&&range.compareBoundaryPoints(Range.START_TO_START,current)===0&&range.compareBoundaryPoints(Range.END_TO_END,current)===0)return;
    mobile?.beforeRestore();editor.focus({preventScroll:true});
    if(!range||!editor.contains(range.startContainer)||!editor.contains(range.endContainer)){
      range=document.createRange();
      range.selectNodeContents(editor.lastElementChild?.hasAttribute('data-word-page')?editor.lastElementChild:editor);
      range.collapse(false);
    }
    selection.removeAllRanges();selection.addRange(range);
  }
  function refresh(){
    updateListLabels(editor);
    const locked=reviewLocked();
    host.classList.toggle('is-reviewing',locked);
    host.classList.toggle('is-review-draft',doc.review?.mode==='editing');
    const editable=String(!preview&&!locked);
    if(editor.contentEditable!==editable)editor.contentEditable=editable;
    editor.setAttribute('aria-readonly',String(preview||locked));
    name.readOnly=preview||locked;
    editor.dataset.wordTheme=doc.theme;
    paper.classList.toggle('is-landscape',doc.orientation==='landscape');paper.style.setProperty('--page-margin',doc.margin+'mm');
    headerView.textContent=doc.header;footerView.textContent=doc.footer+(doc.pageNumbers?' · Номер сторінки — у DOCX':'');
    const text=plainText(doc.html).trim();counter.textContent=`Слів: ${text?text.split(/\s+/).length:0} · Символів: ${text.length}`;
    undoButton.disabled=preview||locked||!undo.length;redoButton.disabled=preview||locked||!redo.length;
    chrome?.update();tables?.sync();pages?.schedule();exchange?.refresh();
  }
  function reviewLocked(){return doc.review?.mode==='deciding'&&doc.review.changes.some(change=>change.status==='pending');}
  function canEdit(){return !busy&&!preview&&!reviewLocked();}
  function changed(typing=false){
    if(disposed||!canEdit())return;
    try{
      const next={...doc,html:cleanHTML(pages?pages.html():editor.innerHTML)};if(JSON.stringify(next)===JSON.stringify(doc))return;
      searchHit=null;
      if(!typing||Date.now()-lastInput>800){undo.push(JSON.stringify(doc));if(undo.length>40)undo.shift();}
      lastInput=typing?Date.now():0;redo=[];doc=next;autosave.change();refresh();remember();
    }catch(error){editor.innerHTML=doc.html;range=null;setStatus('error',storageError(error));notify(storageError(error)+' Попередній стан залишено.');}
  }
  function settings(action){if(!canEdit()||doc.review?.mode==='editing')return;undo.push(JSON.stringify(doc));if(undo.length>40)undo.shift();action();redo=[];lastInput=0;autosave.change();refresh();}
  async function run(action,{flush=false}={}){
    if(busy)return;remember();busy=true;host.inert=true;
    try{if(flush)await autosave.flush();await action();}catch(error){if(!disposed){setStatus('error',storageError(error));notify(storageError(error));}}
    finally{busy=false;if(!disposed){host.inert=false;refresh();}}
  }
  function command(cmd,value=null,immediate=false){
    if(!canEdit())return;
    if(immediate)rememberWhileEditing();
    lastInput=0;if(tables?.formatSelection(cmd,value)){changed();return;}
    restore();
    if(cmd==='fontSize'&&String(value).endsWith('pt')){exactTextSize(editor,getSelection().getRangeAt(0),value);changed();remember();return;}
    document.execCommand('styleWithCSS',false,true);
    const ok=document.execCommand(cmd,false,value);
    if(!ok)notify('Ця дія недоступна для поточного виділення або браузера.');
    changed();remember();
  }
  function insert(html){if(!canEdit())return;restore();const r=getSelection().getRangeAt(0);r.deleteContents();const fragment=r.createContextualFragment(cleanHTML(html)),last=fragment.lastChild;r.insertNode(fragment);if(last){r.setStartAfter(last);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);}changed();remember();}
  function history(back){if(!canEdit())return;const source=back?undo:redo,target=back?redo:undo;if(!source.length)return;target.push(JSON.stringify(doc));doc=JSON.parse(source.pop());editor.innerHTML=doc.html;range=null;syncSettings();autosave.change();refresh();}
  const button=(label,action,attrs={})=>el('button',{type:'button',onPointerdown:e=>e.preventDefault(),onClick:action,...attrs},label);
  const undoButton=button('↶ Скасувати',()=>history(true)),redoButton=button('↷ Повторити',()=>history(false));
  const field=(label,input)=>el('label',{className:'word-field'},el('span',{},label),input);
  const select=(label,options,action)=>field(label,el('select',{'aria-label':label,onChange:e=>action(e.target.value)},...options.map(([value,text])=>el('option',{value},text))));
  function blocks(){restore();return selectedBlocks(editor,getSelection().getRangeAt(0));}
  function styleTargets(selectionRange){
    const cells=editor.querySelectorAll('[data-word-selected-cell]');
    if(cells.length)return [...cells].flatMap(cell=>{
      const contents=document.createRange();contents.selectNodeContents(cell);
      return selectedBlocks(editor,contents,{includeCells:true});
    });
    return selectionRange?selectedBlocks(editor,selectionRange,{includeCells:true}):[];
  }
  function activeParagraphStyle(){
    const ids=new Set(styleTargets(range).map(paragraphStyleId));
    return ids.size===1?[...ids][0]:ids.size?'mixed':'';
  }
  function applyParagraphStyle(key){
    if(!canEdit()||!Object.hasOwn(paragraphStyles,key))return;
    restore();
    const selection=getSelection(),current=selection.getRangeAt(0);
    const targets=styleTargets(current),container=current.startContainer;
    if(!targets.length&&current.collapsed&&(container===editor||container.hasAttribute?.('data-word-page'))){
      const neighbour=container.childNodes[current.startOffset-1]||container.firstChild;
      if(neighbour?.matches?.('p,h1,h2,h3,h4,blockquote')){
        selection.collapse(neighbour,neighbour.lastChild?.nodeName==='BR'?neighbour.childNodes.length-1:neighbour.childNodes.length);
        targets.push(neighbour);
      }
    }
    if(!targets.length){notify('Постав курсор в абзац або виділи текст.');return;}
    const {anchorNode,anchorOffset,focusNode,focusOffset}=selection;
    const replacements=new Map(targets.map(block=>[block,setParagraphStyle(block,key)]));
    const anchor=replacements.get(anchorNode)||anchorNode,focus=replacements.get(focusNode)||focusNode;
    if(editor.contains(anchor)&&editor.contains(focus))selection.setBaseAndExtent(anchor,anchorOffset,focus,focusOffset);
    if(editor.querySelector('[data-word-toc]'))updateContents(editor);
    changed();remember();
  }
  function applyDocumentTheme(theme){
    if(!preview&&doc.theme!==theme)settings(()=>{doc.theme=theme;});
  }
  function continueWithNormalText(event){
    if(event.inputType!=='insertParagraph'||event.isComposing||!event.cancelable||!canEdit())return;
    const selection=getSelection();
    if(!selection?.rangeCount||!selection.isCollapsed)return;
    const cursor=selection.getRangeAt(0),[block]=selectedBlocks(editor,cursor);
    if(!block||block.closest('li')||paragraphStyleId(block)==='normal')return;
    const tail=document.createRange();
    tail.selectNodeContents(block);tail.setStart(cursor.startContainer,cursor.startOffset);
    const rest=tail.cloneContents();
    if(rest.textContent||rest.querySelector('img,[data-word-math]'))return;
    event.preventDefault();
    const next=el('p',{},el('br'));
    block.after(next);selection.collapse(next,0);changed();remember();
  }
  function shiftIndent(delta){
    if(!canEdit())return;
    const targets=blocks(),selection=getSelection();
    const saved={a:selection.anchorNode,ao:selection.anchorOffset,f:selection.focusNode,fo:selection.focusOffset};
    shiftBlocks(targets,delta);
    if(editor.contains(saved.a)&&editor.contains(saved.f)){try{selection.setBaseAndExtent(saved.a,saved.ao,saved.f,saved.fo);}catch{}}
    remember();changed();
  }
  function paragraphStyle(key,value){for(const p of blocks())p.style[key]=value;changed();}
  const font=select('Шрифт',[['Arial','Arial'],['Times New Roman','Times New Roman'],['Georgia','Georgia'],['Verdana','Verdana'],['Courier New','Courier New'],['Comic Sans MS','Comic Sans MS']],value=>command('fontName',value));
  const fontSize=select('Розмір',[['3','12 пт'],['1','8 пт'],['2','10 пт'],['11pt','11 пт'],['4','14 пт'],['5','18 пт'],['6','24 пт'],['7','36 пт']],value=>command('fontSize',value));
  const color=field('Колір тексту',el('input',{type:'color',value:'#172033',onInput:e=>command('foreColor',e.target.value)}));
  const highlight=field('Виділення',el('input',{type:'color',value:'#fff2a8',onInput:e=>command('hiliteColor',e.target.value)}));
  const ribbon=el('div',{className:'word-ribbon'},
    el('div',{className:'word-tool-group'},font,fontSize),
    el('div',{className:'word-tool-group'},button('Ж',()=>command('bold'),{'aria-label':'Напівжирний'}),button('К',()=>command('italic'),{'aria-label':'Курсив'}),button('П',()=>command('underline'),{'aria-label':'Підкреслення'}),button('abc̶',()=>command('strikeThrough'),{'aria-label':'Закреслення'}),color,highlight,button('Очистити формат',()=>command('removeFormat'))),
    el('div',{className:'word-tool-group'},button('Ліворуч',()=>command('justifyLeft')),button('По центру',()=>command('justifyCenter')),button('Праворуч',()=>command('justifyRight')),button('За шириною',()=>command('justifyFull')),button('• Список',()=>command('insertUnorderedList')),button('1. Список',()=>command('insertOrderedList')),
      button('← Відступ',()=>shiftIndent(-1)),button('Відступ →',()=>shiftIndent(1))),
    el('div',{className:'word-tool-group'},select('Інтервал',[['1.5','1,5'],['1','1'],['1.15','1,15'],['2','2']],value=>paragraphStyle('lineHeight',value)),select('Після абзацу',[['8pt','8 пт'],['0pt','0'],['12pt','12 пт'],['18pt','18 пт']],value=>paragraphStyle('marginBottom',value)),select('Перший рядок',[['0mm','Без відступу'],['12.5mm','1,25 см'],['20mm','2 см']],value=>paragraphStyle('textIndent',value))));
  function dialog(title,...content){
    const message=el('p',{className:'word-dialog-message',role:'alert',hidden:true});
    const modal=el('dialog',{className:'word-dialog','aria-label':title,
      onInput:()=>{message.hidden=true;},onClose:()=>{dialogs.delete(modal);modal.remove();}},
      el('div',{className:'word-dialog-heading'},el('h2',{},title),button('✕',()=>modal.close(),{'aria-label':'Закрити',autofocus:true})),
      message,
      el('div',{className:'word-dialog-content'},...content));
    dialogs.add(modal);document.body.append(modal);modal.showModal();return modal;
  }
  function dialogError(modal,text){
    const message=modal.querySelector('.word-dialog-message');
    message.hidden=false;message.textContent=text;
  }
  function addTable(){remember();const rows=el('input',{type:'number',min:1,max:20,value:3}),cols=el('input',{type:'number',min:1,max:10,value:3});let modal;
    modal=dialog('Вставити таблицю',field('Рядки (1–20)',rows),field('Стовпці (1–10)',cols),button('Вставити',()=>{const r=Number(rows.value),c=Number(cols.value);if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||r>20||c<1||c>10){dialogError(modal,'Обери 1–20 рядків і 1–10 стовпців.');return;}modal.close();insertBlock('<table><tbody>'+Array.from({length:r},()=>'<tr>'+Array.from({length:c},()=>'<td><p><br></p></td>').join('')+'</tr>').join('')+'</tbody></table>');},{className:'primary'}));
  }
  function currentCell(focus=true){if(focus)restore();const node=focus?getSelection().anchorNode:range?.startContainer;if(!node||!editor.contains(node))return null;return (node.nodeType===1?node:node.parentElement).closest('td,th');}
  function tableAction(action){const cell=currentCell();if(!cell||!editor.contains(cell)){notify('Постав курсор у комірку таблиці.');return;}const row=cell.parentElement,table=cell.closest('table');
    if(action==='row'){if(table.rows.length>=20){notify('Максимум 20 рядків.');return;}const next=table.insertRow(row.rowIndex+1);for(let i=0;i<row.cells.length;i++)next.insertCell().innerHTML='<p><br></p>';}
    if(action==='column'){if(row.cells.length>=10){notify('Максимум 10 стовпців.');return;}for(const r of table.rows){const td=document.createElement('td');td.innerHTML='<p><br></p>';r.insertBefore(td,r.cells[cell.cellIndex+1]||null);}}
    if(action==='removeRow'){if(table.rows.length===1)table.remove();else row.remove();}
    if(action==='removeColumn'){if([...table.rows].some(r=>[...r.cells].some(c=>c.colSpan!==1||c.rowSpan!==1))){notify('Видалення стовпця доступне без об’єднаних комірок.');return;}const index=cell.cellIndex;if(row.cells.length===1)table.remove();else for(const r of table.rows)r.cells[index]?.remove();}
    if(action==='removeTable')table.remove();changed();
  }
  function addLink(){
    rememberWhileEditing();
    const url=el('input',{type:'text',inputmode:'url',placeholder:'https://…',autocapitalize:'off',spellcheck:'false'});
    const form=el('form',{onSubmit:e=>{
      e.preventDefault();
      const href=safeLink(url.value.trim());
      if(!href){dialogError(modal,'Введи адресу, що починається з https://, http:// або mailto:.');return;}
      modal.close();
      restore();
      if(getSelection().isCollapsed)insert(`<a href="${escapeHTML(href)}">${escapeHTML(href)}</a>`);
      else command('createLink',href);
    }},field('Адреса посилання',url),el('button',{type:'submit',className:'primary'},'Вставити посилання'));
    const modal=dialog('Посилання',form);
    if(!mobile.isMobile())url.focus();
  }
  const imageInput=el('input',{type:'file',accept:'image/png,image/jpeg',hidden:true,onChange:e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(file.size>2*1024*1024){notify('Зображення має бути до 2 МБ.');return;}
    run(async()=>{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не вдалося прочитати зображення.'));reader.readAsDataURL(file);});
      if(!/^data:image\/(png|jpeg);base64,/i.test(data))throw new Error('Додай PNG або JPEG.');
      const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Файл зображення пошкоджено.'));image.src=data;});
      const scale=Math.min(1,600/image.width,800/image.height),html=`<p><img src="${data}" width="${Math.round(image.width*scale)}" height="${Math.round(image.height*scale)}" alt="Зображення"></p><p><br></p>`;
      // Insertion is synchronous; release the UI lock so the edit enters history.
      busy=false;host.inert=false;insert(html);
    });
  }});
  const insertTools=el('details',{className:'word-section'},el('summary',{},'Вставлення та таблиці'),el('div',{className:'word-tool-group'},button('Таблиця',addTable),button('+ Рядок',()=>tableAction('row')),button('+ Стовпець',()=>tableAction('column')),button('Видалити рядок',()=>tableAction('removeRow')),button('Видалити таблицю',()=>tableAction('removeTable')),button('Зображення',()=>{remember();imageInput.click();}),button('Посилання',addLink),imageInput));
  const orientation=el('select',{onChange:()=>settings(()=>{doc.orientation=orientation.value;})},el('option',{value:'portrait'},'Книжкова'),el('option',{value:'landscape'},'Альбомна'));
  const margin=el('input',{type:'number',value:20,min:10,max:40,onChange:()=>{const value=Number(margin.value);if(!Number.isFinite(value)||value<10||value>40){notify('Поля: від 10 до 40 мм.');margin.value=doc.margin;return;}settings(()=>{doc.margin=value;});}});
  const header=el('input',{maxlength:200,onChange:()=>settings(()=>{doc.header=header.value;})}),footer=el('input',{maxlength:200,onChange:()=>settings(()=>{doc.footer=footer.value;})});
  const numbers=el('input',{type:'checkbox',onChange:()=>settings(()=>{doc.pageNumbers=numbers.checked;})});
  function syncSettings(){orientation.value=doc.orientation;margin.value=doc.margin;header.value=doc.header;footer.value=doc.footer;numbers.checked=doc.pageNumbers;}
  const layout=el('details',{className:'word-section'},el('summary',{},'Сторінка та колонтитули'),el('div',{className:'word-tool-group'},field('Орієнтація A4',orientation),field('Поля, мм',margin),field('Верхній колонтитул',header),field('Нижній колонтитул',footer),field('Номери сторінок',numbers)),el('p',{className:'muted'},'Поділ на сторінки в DOCX і під час друку може відрізнятися.'));
  const find=el('input',{type:'search',placeholder:'Знайти…','aria-label':'Текст для пошуку'}),replacement=el('input',{placeholder:'Замінити на…','aria-label':'Текст заміни'});
  find.addEventListener('input',()=>{searchOffset=0;searchHit=null;});
  find.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();findNext();}});
  function textNodes(){const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);const nodes=[];let n;while(n=walker.nextNode())nodes.push(n);return nodes;}
  function findNext(){const value=find.value;if(!value)return;const nodes=textNodes();let skipped=0,match;
    for(const node of nodes){const start=Math.max(0,searchOffset-skipped),index=node.textContent.toLocaleLowerCase('uk').indexOf(value.toLocaleLowerCase('uk'),start);if(index>=0){match={node,index,absolute:skipped+index};break;}skipped+=node.textContent.length;}
    if(!match&&searchOffset){searchOffset=0;findNext();return;}if(!match){notify('Нічого не знайдено. Пошук працює в межах одного фрагмента форматування.');return;}
    const r=document.createRange();r.setStart(match.node,match.index);r.setEnd(match.node,match.index+value.length);range=r;restore();searchOffset=match.absolute+value.length;
    if(!mobile.isMobile()){match.node.parentElement.scrollIntoView({block:'nearest'});return;}
    searchHit=match;
    requestAnimationFrame(revealSearchHit);
  }
  function revealSearchHit(){
    if(disposed||!searchHit||!editor.contains(searchHit.node))return;
    const visible=workspace.getBoundingClientRect();
    if(visible.height<36)return;
    const {node,index}=searchHit,r=document.createRange();
    r.setStart(node,index);r.setEnd(node,index+find.value.length);
    const hit=r.getBoundingClientRect();
    if(hit.bottom>visible.bottom-18)workspace.scrollTop+=hit.bottom-visible.bottom+18;
    else if(hit.top<visible.top+18)workspace.scrollTop-=visible.top+18-hit.top;
  }
  function replaceAll(){const value=find.value;if(!value)return;let count=0;for(const node of textNodes()){const source=node.textContent,lower=source.toLocaleLowerCase('uk'),needle=value.toLocaleLowerCase('uk');let start=0,index=lower.indexOf(needle),out='';while(index>=0){out+=source.slice(start,index)+replacement.value;start=index+value.length;count++;index=lower.indexOf(needle,start);}if(start)node.textContent=out+source.slice(start);}changed();searchOffset=0;notify(`Замінено: ${count}.`);}
  const searchTools=el('details',{className:'word-section'},el('summary',{},'Пошук і заміна'),el('div',{className:'word-tool-group'},find,replacement,button('Знайти далі',findNext),button('Замінити вибране',()=>{restore();if(getSelection().toString().toLocaleLowerCase('uk')!==find.value.toLocaleLowerCase('uk')||!find.value){findNext();return;}insert(escapeHTML(replacement.value));}),button('Замінити все',replaceAll)));
  function insertBlock(html){
    if(!canEdit())return false;
    restore();const r=getSelection().getRangeAt(0),element=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
    if(element.closest('td,th,[data-word-toc],[data-word-math]')){notify('Постав курсор у звичайний абзац поза таблицею, змістом чи формулою.');return false;}
    const page=element.closest('[data-word-page]')||editor;
    r.deleteContents();let top=r.startContainer;while(top.parentNode&&top.parentNode!==page)top=top.parentNode;
    const fragment=r.createContextualFragment(cleanHTML(html));
    let following=document.createElement('p');following.innerHTML='<br>';
    if(top!==page&&top.parentNode===page){
      const tail=document.createRange();tail.selectNodeContents(top);tail.setStart(r.startContainer,r.startOffset);const content=tail.extractContents();
      if(content.childNodes.length){following=top.cloneNode(false);following.removeAttribute('id');following.append(content);}
      top.after(fragment,following);
    }else{r.insertNode(fragment);const last=page.lastChild;last?.after(following);}
    const cursor=document.createRange();cursor.selectNodeContents(following);cursor.collapse(true);getSelection().removeAllRanges();getSelection().addRange(cursor);range=cursor;changed();return true;
  }
  function addContents(){remember();if(editor.querySelector('[data-word-toc]')){updateContents(editor);changed();notify('Зміст оновлено.');return;}if(insertBlock('<div data-word-toc="true"><p>Зміст</p></div>')){updateContents(editor);changed();notify('Зміст створено зі стилів «Заголовок 1–3».');}}
  function contentsAtStart(){
    if(!canEdit())return;
    const first=editor.querySelector('[data-word-page]')||editor;
    const toc=editor.querySelector('[data-word-toc]')||el('div',{'data-word-toc':'true'});
    first.prepend(toc);updateContents(editor);changed();
    workspace.scrollTop=0;
  }
  function removeContents(){
    if(!canEdit())return;
    const toc=editor.querySelector('[data-word-toc]');
    if(!toc)return;
    toc.remove();changed();notify('Видалення змісту записано.');
  }
  function editFormula(existing=null){
    remember();const input=el('textarea',{'aria-label':'Запис формули',maxlength:300,rows:3}),result=el('div',{className:'word-math-preview','aria-live':'polite'});input.value=existing?.getAttribute('data-word-math')||'x^(2) + y^(2) = z^(2)';
    const refreshFormula=()=>{try{result.innerHTML=formulaHTML(input.value);apply.disabled=false;}catch(error){result.textContent=error.message;apply.disabled=true;}};
    let modal;const apply=button(existing?'Застосувати':'Вставити формулу',()=>{
      try{
        const html=formulaHTML(input.value);modal.close();
        if(existing?.isConnected){const wrap=document.createElement('span');wrap.innerHTML=html;existing.replaceWith(wrap.firstChild);changed();}
        else insert(html+' ');
      }catch(error){if(modal.open)dialogError(modal,error.message);else notify(error.message);}
    },{className:'primary'});
    const templates=el('div',{className:'word-math-templates'},...['frac(a,b)','sqrt(x)','x^(2)','a_(n)','π ≈ 3.14','a ≤ b','ρ','→','−','='].map(value=>button(value,()=>{const start=input.selectionStart,end=input.selectionEnd;
      if(input.value.length-(end-start)+value.length>300){dialogError(modal,'Формула може містити до 300 символів.');return;}
      input.setRangeText(value,start,end,'end');if(!mobile?.isMobile())input.focus();refreshFormula();})));
    modal=dialog('Математична формула',input,templates,result,el('p',{className:'muted'},'Кнопки додають фрагмент у позицію курсора або замінюють лише виділений запис. Дріб: frac(a,b). Корінь: sqrt(x). Степінь: x^(2). Індекс: a_(n). Це запис формули, не обчислення. Натисни готову формулу в документі, щоб змінити її.'),apply,...(existing?[button('Видалити формулу',()=>{existing.remove();changed();modal.close();})]:[]));input.addEventListener('input',refreshFormula);refreshFormula();if(!mobile?.isMobile())input.focus();input.setSelectionRange(input.value.length,input.value.length);
  }
  function listLevels(){
    const targets=blocks().filter(p=>!p.closest('[data-word-toc],[data-word-math],td,th')&&!p.hasAttribute('data-word-page'));let modal;
    const setLevel=level=>{
      if(!targets.length||targets.some(p=>!['P','DIV','H1','H2','H3','H4','BLOCKQUOTE'].includes(p.tagName)||p.hasAttribute('data-word-break'))){dialogError(modal,'Обери звичайні абзаци. Якщо ввімкнено звичайний список, спочатку вимкни його.');return;}
      for(const p of targets){if(level)p.setAttribute('data-word-list-level',String(level));else{p.removeAttribute('data-word-list-level');p.removeAttribute('data-word-list-label');}}
      changed();modal.close();};
    modal=dialog('Багаторівневий список',el('p',{},'Виділи потрібні абзаци перед відкриттям цього вікна. Обери їхній рівень; колір тексту залишиться.'),...[[1,'I рівень — 1.'],[2,'II рівень — 1)'],[3,'III рівень — 1.'],[0,'Без нумерації']].map(([level,label])=>button(label,()=>setLevel(level))));
  }
  function columnsDialog(){
    remember();restore();
    // Capture the editor selection before showModal makes the editor inert.
    const selectedRange=getSelection().getRangeAt(0).cloneRange(),targets=selectedBlocks(editor,selectedRange);
    const node=selectedRange.startContainer,element=node.nodeType===1?node:node.parentElement,existing=element?.closest('[data-word-columns]');
    const count=el('select',{},...[[1,'Один'],[2,'Два'],[3,'Три']].map(([value,text])=>el('option',{value},text)));count.value=existing?.getAttribute('data-word-columns')||'2';
    const width=el('input',{type:'number',min:3,max:12,step:.1,value:existing?.getAttribute('data-column-width')||7}),gap=el('input',{type:'number',min:0,max:3,step:.1,value:existing?.getAttribute('data-column-gap')||1});let modal;
    modal=dialog('Текстові стовпці',el('p',{},'Виділи абзац або кілька сусідніх абзаців. Для практичної роботи: два стовпці по 7 см, проміжок 1 см.'),field('Кількість стовпців',count),field('Ширина кожного, см',width),field('Проміжок, см',gap),button('Застосувати',()=>{
      const n=Number(count.value),w=Number(width.value),g=Number(gap.value),available=(doc.orientation==='landscape'?29.7:21)-doc.margin/5;
      if(n!==1&&(!Number.isFinite(w)||!Number.isFinite(g)||w<3||w>12||g<0||g>3||n*w+(n-1)*g>available+.01)){dialogError(modal,'Стовпці мають уміститися між полями аркуша. Зменш ширину або проміжок.');return;}
      if(existing){modal.close();if(n===1)existing.replaceWith(...existing.childNodes);else{existing.setAttribute('data-word-columns',n);existing.setAttribute('data-column-width',w);existing.setAttribute('data-column-gap',g);styleColumns(existing);}changed();return;}
      if(n===1){modal.close();return;}
      const wrap=document.createElement('div');wrap.setAttribute('data-word-columns',n);wrap.setAttribute('data-column-width',w);wrap.setAttribute('data-column-gap',g);styleColumns(wrap);
      try{wrapColumnSelection(editor,targets,wrap);}catch(error){dialogError(modal,error.message);return;}
      modal.close();
      const r=document.createRange();r.selectNodeContents(wrap);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);range=r;changed();
    },{className:'primary'}));
  }
  const formattingTools=el('div',{className:'word-document-tools'},button('Багаторівневий список',listLevels),button('Текстові стовпці',columnsDialog),button('Назва й дата в колонтитулі',()=>settings(()=>{doc.header=(name.value+' · '+new Date().toLocaleDateString('uk-UA')).slice(0,200);header.value=doc.header;})));
  const documentTools=el('div',{className:'word-document-tools'},button('Зміст за заголовками',addContents),button('Зміст на початок',contentsAtStart),button('Оновити зміст',()=>{if(!editor.querySelector('[data-word-toc]')){notify('Спочатку встав зміст.');return;}updateContents(editor);changed();}),button('Формула',()=>editFormula()),button('Розрив сторінки',()=>insertBlock(breakHTML('page'))),button('Розділ з нової сторінки',()=>insertBlock(breakHTML('section-next'))),button('Розділ без нової сторінки',()=>insertBlock(breakHTML('section-continuous'))));
  async function open(blob,filename,stored){
    let next;
    if(/\.docx$/i.test(filename)){next=await importDocx(blob);notify('DOCX імпортовано зі спрощенням: складні стилі, секції, формули та обтікання можуть не зберегтися.');}
    else if(/\.txt$/i.test(filename)){if(blob.size>MAX_SIZE)throw new Error('TXT завеликий.');next={...blank(),html:(await blob.text()).split(/\r?\n/).map(line=>`<p>${escapeHTML(line)||'<br>'}</p>`).join('')};}
    else next=await readProject(blob);
    const reopening=stored&&stored.id===fileId;
    applyDocument(next,filename,stored,practice&&reopening?sourceId:undefined,reopening?resume?.position:undefined);
    if(!record)autosave.change();
  }
  function applyDocument(next,filename,stored,practiceFileId,position){
    doc=next;editor.innerHTML=doc.html;name.value=filename.replace(/(\.word\.json|\.docx|\.txt)$/i,'');
    record=/\.word\.json$/i.test(filename)?stored:undefined;undo=[];redo=[];range=null;
    if(currentPracticeFileId!==practiceFileId)chrome.setPracticeGuide(guideFor(practiceFileId));
    currentPracticeFileId=practiceFileId;pendingPosition=position;
    searchOffset=0;searchHit=null;
    setPreview(false);syncSettings();refresh();
    if(record){setStatus('saved','Збережено в «Мої файли».');rememberCurrentWork();}
  }
  function setReview(html,review){
    undo.push(JSON.stringify(doc));if(undo.length>40)undo.shift();redo=[];lastInput=0;
    if(doc.html!==html){editor.innerHTML=html;range=null;}
    doc={...doc,html,review};autosave.change();refresh();
  }
  const openInput=el('input',{type:'file',accept:'.docx,.txt,.json',hidden:true,onChange:e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>open(file,file.name),{flush:true});}});
  function setPreview(value){
    if(preview===value)return;
    preview=value;host.classList.toggle('is-preview',preview);
    previewButton.textContent=preview?'До редагування':'Попередній перегляд';
    refresh();
  }
  const previewButton=button('Попередній перегляд',()=>setPreview(!preview));
  const toolbar=el('div',{className:'word-topbar'},name,button('+ Новий',()=>run(async()=>{
    applyDocument(blank(),'Мій документ');
    autosave.change();
  },{flush:true})),button('Відкрити',()=>{remember();openInput.click();}),button('Зберегти',()=>run(async()=>{if(!record&&!autosave.dirty())autosave.change();await autosave.flush();}),{className:'primary'}),button('Експорт DOCX',()=>run(async()=>download(exportDocx(doc),baseName()+'.docx'))),button('Друк / PDF',()=>{printDocument(doc);notify('У вікні друку обери принтер або «Зберегти як PDF».');}),button('Експорт TXT',()=>run(async()=>download(new Blob([plainText(doc.html)],{type:'text/plain;charset=utf-8'}),baseName()+'.txt'))),button('Копія проєкту',()=>run(async()=>download(projectBlob(doc),baseName()+'.word.json'))),el('a',{className:'button',href:'https://classroom.google.com/',target:'_blank',rel:'noopener noreferrer'},'Відкрити Classroom'),openInput);
  host.append(toolbar,status,ribbon,insertTools,layout,searchTools,el('div',{className:'word-viewbar'},undoButton,redoButton,previewButton,counter),workspace);
  tables=tableControls({editor,getPageWidth:()=>((doc.orientation==='landscape'?297:210)-2*doc.margin)/10,getCell:()=>currentCell(false),changed,notify,onSelectionChange:remember});
  mobile=mobileEditing(host,editor,remember);
  const activityTools=createPracticeTools({editor,blocks,dialog,changed,notify,canEdit,dialogError});
  const tableExtras=[button('Видалити стовпець',()=>tableAction('removeColumn')),button('Стиль таблиці',()=>{
    const table=currentCell(false)?.closest('table');
    if(table)activityTools.formatTable(table);
    else activityTools.objects();
  })];
  const outlineTool=button('Структура',activityTools.outline);
  const objectsTool=button('Таблиці та зображення',activityTools.objects);
  const reviewTool=button('Рецензування',()=>exchange.open());
  chrome=buildChrome({pauseEditing:()=>mobile.pause(),formattingTools,documentTools,tableExtras,tableTools:tables.root,tableSelectionBar:tables.selectionBar,hasTableCell:tables.hasCell,host,name,status,counter,ribbon,insertTools,layout,searchTools,revealSearchHit,toolbar,undoButton,redoButton,previewButton,workspace,command,activeParagraphStyle,applyParagraphStyle,applyDocumentTheme,getTheme:()=>doc.theme,outlineTool,objectsTool,reviewTool});
  root.append(el('style',{},mathCSS+structureCSS+formattingCSS+documentStyleCSS+objectStylesCSS),host);
  exchange=createPracticeExchange({fs,getState:()=>({doc,record,name:name.value,practiceFileId:currentPracticeFileId}),
    applyDocument,setReview,removeContents,openObjects:activityTools.objects,run,dialog,dialogError,notify});
  pages=paginate(editor,()=>doc,(count,restored)=>{
    if(restored){range=restored;chrome.update();tables.sync();}
    else rememberWhileEditing();
    counter.textContent=counter.textContent.replace(/ · Сторінок: \d+$/,'')+' · Сторінок: '+count;
    if(pendingPosition){
      const {top,left,pageTop}=pendingPosition;
      pendingPosition=undefined;
      if(Number.isFinite(top))workspace.scrollTop=top;
      if(Number.isFinite(left))workspace.scrollLeft=left;
      if(Number.isFinite(pageTop))window.scrollTo({top:pageTop,behavior:'instant'});
    }
  },()=>mobile.quiet(),()=>range);
  document.addEventListener('selectionchange',rememberWhileEditing);
  editor.addEventListener('beforeinput',continueWithNormalText);
  editor.addEventListener('input',()=>changed(true));editor.addEventListener('click',e=>{
    const formula=e.target.closest('[data-word-math]');if(formula){e.preventDefault();if(canEdit())editFormula(formula);return;}
    const marker=e.target.closest('[data-word-break]');if(marker&&canEdit()){const modal=dialog('Розрив',el('p',{},marker.textContent),button('Видалити розрив',()=>{marker.remove();changed();modal.close();}));return;}
    const image=e.target.closest('img');
    if(image&&canEdit()){e.preventDefault();activityTools.formatImage(image);return;}
    const link=e.target.closest('a');
    if(link){
      e.preventDefault();
      const href=link.getAttribute('href')||'';
      if(/^#word-heading-\d+$/.test(href))editor.querySelector(href)?.scrollIntoView({block:'center',behavior:'smooth'});
      else if(image&&preview&&safeLink(href))window.open(href,'_blank','noopener,noreferrer');
    }
  });
  editor.addEventListener('paste',e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain');insert(escapeHTML(text).replaceAll('\n','<br>'));});
  editor.addEventListener('drop',e=>{e.preventDefault();notify('Додавай зображення кнопкою «Зображення». Текст можна вставити через Ctrl+V.');});
  name.addEventListener('input',()=>autosave.change());
  host.addEventListener('keydown',e=>{
    if(['Enter',' '].includes(e.key)&&e.target.matches('[data-word-math],[data-word-break]')){e.preventDefault();e.target.click();return;}
    if(editor.contains(e.target)&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!preview){e.preventDefault();insertBlock(breakHTML('page'));return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();run(async()=>{if(!record&&!autosave.dirty())autosave.change();await autosave.flush();});}
    if(editor.contains(e.target)&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='z'&&!e.shiftKey);}
  });
  const leave=e=>{if(autosave.dirty()||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);
  syncSettings();refresh();if(fileId)run(async()=>{
    const file=await fs.getFile(fileId);
    if(!file)throw new Error('Файл уже видалено.');
    await open(file.blob,file.name,file);
  });
  return {getResumePosition(id){if(record&&record.id===id)return pendingPosition??{top:workspace.scrollTop,left:workspace.scrollLeft,pageTop:window.scrollY};},
    async canLeave(){if(busy){notify('Дочекайся завершення операції.');return false;}try{await autosave.flush();return true;}catch{return confirm('Документ не збережено. Вийти та втратити зміни? Можна залишитися й експортувати копію.');}},dispose(){
    disposed=true;
    for(const modal of dialogs)modal.remove();
    dialogs.clear();
    chrome?.dispose();tables?.dispose();pages?.dispose();mobile?.dispose();autosave.dispose();
    document.removeEventListener('selectionchange',rememberWhileEditing);window.removeEventListener('beforeunload',leave);
  }};
}
