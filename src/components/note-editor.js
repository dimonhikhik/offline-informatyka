import { el,download } from '../components/ui.js';
import { saveFile } from '../core/filesystem/index.js';
import { storageError } from '../core/storage/database.js';
import { createAutosave } from '../core/storage/autosave.js';
export function openNote(file, onSaved) {
  let loading = Boolean(file), closing = false, closed = false;
  const name = el('input',{value:file?.name || 'Моя нотатка.txt',maxlength:180,required:true,'aria-label':'Назва нотатки'});
  const text = el('textarea',{'aria-label':'Текст нотатки',placeholder:'Запиши свою ідею…',spellcheck:true});
  const message = el('p',{'aria-live':'polite',className:'muted'},file ? 'Відкриваємо текст…' : 'Почни писати — нотатка збережеться автоматично.');
  const autosave = createAutosave(async () => {
    const snapshot = {name:name.value,blob:new Blob([text.value],{type:'text/plain;charset=utf-8'})};
    file = await saveFile({...file,...snapshot,moduleId:'notes'});
    Promise.resolve(onSaved()).catch(() => {});
  }, (state,error) => {
    message.textContent = {dirty:'Є зміни. Зараз збережемо…',saving:'Зберігаємо…',saved:'Збережено на цьому пристрої.'}[state] || `Не збережено. ${storageError(error)} Натисни «Зберегти» ще раз або експортуй TXT.`;
  });
  const leave = e => { if (autosave.dirty()) { e.preventDefault(); e.returnValue = ''; } };
  const background = () => { if (document.hidden) autosave.flush().catch(() => {}); };
  async function close() {
    if (closing) return;
    closing = true;
    name.disabled = true; text.disabled = true;
    try { await autosave.flush(); dialog.close(); }
    catch { if (confirm('Зміни не збережено. Закрити й втратити їх? Можна скасувати та експортувати TXT.')) dialog.close(); }
    finally { closing = false; name.disabled = loading; text.disabled = loading; }
  }
  const save = el('button',{className:'primary',disabled:loading,onClick:async()=>{
    if (loading || closing) return;
    save.disabled = true;
    if (!file && !autosave.dirty()) autosave.change();
    try { await autosave.flush(); } catch {} finally { save.disabled = loading; }
  }},'Зберегти');
  const exportButton = el('button',{disabled:loading,onClick:()=>download(new Blob([text.value],{type:'text/plain;charset=utf-8'}),name.value.trim() || 'Нотатка.txt')},'Експортувати TXT');
  const dialog = el('dialog',{className:'note-dialog',onCancel:e=>{e.preventDefault();close();},onClose:()=>{
    closed = true; autosave.dispose(); window.removeEventListener('beforeunload',leave); document.removeEventListener('visibilitychange',background); dialog.remove();
  }},el('div',{className:'section-bar'},el('h2',{},'Текстова нотатка'),el('button',{'aria-label':'Закрити',onClick:close},'✕')),name,text,message,
  el('div',{className:'actions'},save,exportButton,el('a',{className:'button',href:'https://classroom.google.com/',target:'_blank',rel:'noopener noreferrer'},'Відкрити Classroom')));
  name.disabled = loading; text.disabled = loading;
  dialog.addEventListener('input',()=>{if(!loading && !closing)autosave.change();});
  window.addEventListener('beforeunload',leave); document.addEventListener('visibilitychange',background);
  document.body.append(dialog); dialog.showModal();
  if (file) file.blob.text().then(value=>{
    if (closed) return;
    text.value = value; loading = false;
    name.disabled = false; text.disabled = false; save.disabled = false; exportButton.disabled = false;
    message.textContent = 'Файл відкрито. Зміни зберігатимуться автоматично.';
  }).catch(()=>{message.textContent = 'Не вдалося прочитати текст. Закрий вікно та спробуй знову.';});
}
