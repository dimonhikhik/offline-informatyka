import { formattingCSS } from './formatting.js';
import { mathCSS } from './math.js';
import { updateContents } from './structure.js';
import { cleanHTML } from './model.js';
import { documentStyleCSS,objectStylesCSS,themeId } from './styles.js';
export function printDocument(doc){
  const frame=document.createElement('iframe');frame.className='word-print-frame';frame.title='Попередній перегляд друку';document.body.append(frame);
  const page=frame.contentDocument;page.open();page.write('<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Документ</title></head><body></body></html>');page.close();
  const style=page.createElement('style');style.textContent=`@page{size:A4 ${doc.orientation};margin:${doc.margin}mm}body{font:12pt Arial,sans-serif;color:#111;line-height:1.5}p{margin:0 0 8pt}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #64748b;padding:6px;overflow-wrap:anywhere}img{max-width:100%;height:auto}h1,h2,h3{break-after:avoid}tr,img{break-inside:avoid}header{position:fixed;top:-14mm;font-size:9pt}footer{position:fixed;bottom:-14mm;font-size:9pt}a{color:#2563eb}*{box-sizing:border-box}`;
  style.textContent+=formattingCSS+mathCSS+'[data-word-break]{height:0;margin:0;padding:0;font-size:0;line-height:0;border:0}[data-word-break="page"],[data-word-break="section-next"]{break-after:page;page-break-after:always}[data-word-break="section-continuous"]{display:none}[data-word-toc]{margin:12pt 0}[data-word-toc] p{margin:4pt 0}';
  style.textContent+=documentStyleCSS+objectStylesCSS+'[data-word-table-style]{print-color-adjust:exact;-webkit-print-color-adjust:exact}';
  page.head.append(style);const header=page.createElement('header'),footer=page.createElement('footer'),main=page.createElement('main');header.textContent=doc.header;footer.textContent=doc.footer;main.dataset.wordTheme=themeId(doc.theme);main.innerHTML=cleanHTML(doc.html);updateContents(main);page.body.append(header,main,footer);
  const cleanup=()=>frame.remove();frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});
  Promise.all([...page.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;}))).then(()=>{frame.contentWindow.focus();frame.contentWindow.print();});
  // Some mobile browsers do not emit afterprint; remove only when returning to the editor.
  setTimeout(cleanup,120000);
}
