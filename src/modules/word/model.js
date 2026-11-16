import { columnSettings,styleColumns,updateListLabels } from './formatting.js';
import { formulaHTML } from './math.js';
import { breakHTML } from './structure.js';
import { imagePresets,isStyleAttribute,tablePresets,themeId } from './styles.js';
import { validateReview } from './review.js';
export const MAX_SIZE=8*1024*1024;
export const blank=()=>({format:'informatyka-word',version:1,html:'<p><br></p>',theme:'classic',orientation:'portrait',margin:20,header:'',footer:'',pageNumbers:false});
const tags=new Set(['FONT','P','DIV','BR','SPAN','B','STRONG','I','EM','U','S','STRIKE','SUB','SUP','H1','H2','H3','H4','UL','OL','LI','TABLE','TBODY','THEAD','TR','TD','TH','A','IMG','BLOCKQUOTE']);
const styles=['font-family','font-size','font-weight','font-style','text-decoration','color','background-color','text-align','line-height','margin-left','margin-top','margin-bottom','text-indent','vertical-align','width','height','border-width','border-style','border-color',...['top','right','bottom','left'].flatMap(side=>['width','style','color'].map(p=>'border-'+side+'-'+p))];
export function safeLink(value){try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)?url.href:'';}catch{return '';}}
export function imageData(value){return typeof value==='string'&&/^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(value)&&value.length<3*1024*1024;}
export function cleanHTML(html){
  if(typeof html!=='string'||html.length>MAX_SIZE)throw new Error('Документ завеликий: до 8 МБ.');
  const parsed=new DOMParser().parseFromString(html,'text/html'),out=document.createElement('div');let count=0;
  function copy(node,parent,depth=0){
    if(++count>20000||depth>60)throw new Error('Документ має надто складну структуру.');
    if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
    if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','LINK','META'].includes(node.tagName))return;
    if(!tags.has(node.tagName)){for(const child of node.childNodes)copy(child,parent,depth+1);return;}
    if(node.hasAttribute('data-word-math')){const wrap=document.createElement('span');wrap.innerHTML=formulaHTML(node.getAttribute('data-word-math'));parent.append(wrap.firstChild);return;}
    if(node.hasAttribute('data-word-break')){const wrap=document.createElement('div');wrap.innerHTML=breakHTML(node.getAttribute('data-word-break'));parent.append(wrap.firstChild);return;}
    const el=document.createElement(node.tagName==='FONT'?'span':node.tagName.toLowerCase());
    const paragraphStyle=node.getAttribute('data-word-style');
    if(isStyleAttribute(node.tagName,paragraphStyle))el.dataset.wordStyle=paragraphStyle;
    const outlineLevel=node.getAttribute('data-word-outline-level');
    if(outlineLevel?.length===1&&/^[1-9]$/.test(outlineLevel)&&['P','DIV','H1','H2','H3','H4','LI','BLOCKQUOTE'].includes(node.tagName))el.dataset.wordOutlineLevel=outlineLevel;
    const tableStyle=node.getAttribute('data-word-table-style');
    if(node.tagName==='TABLE'&&Object.hasOwn(tablePresets,tableStyle))el.dataset.wordTableStyle=tableStyle;
    if(node.hasAttribute('data-word-toc')){el.setAttribute('data-word-toc','true');el.contentEditable='false';}
    if(/^word-heading-\d+$/.test(node.id))el.id=node.id;
    for(const property of styles){const value=node.style.getPropertyValue(property);if(value&&!/url\(|expression|var\(/i.test(value)&&value.length<150)el.style.setProperty(property,value);}
    if(['P','DIV','H1','H2','H3','H4','BLOCKQUOTE'].includes(node.tagName)&&['1','2','3'].includes(node.getAttribute('data-word-list-level')))el.setAttribute('data-word-list-level',node.getAttribute('data-word-list-level'));
    if(node.tagName==='DIV'&&node.hasAttribute('data-word-columns')){const {count,width,gap}=columnSettings(node);el.setAttribute('data-word-columns',count);el.setAttribute('data-column-width',width);el.setAttribute('data-column-gap',gap);styleColumns(el);}
    if(node.tagName==='OL'&&node.hasAttribute('start')){const start=Number(node.getAttribute('start'));if(Number.isInteger(start)&&start>=1&&start<=100000)el.setAttribute('start',String(start));}
    if(node.tagName==='FONT'){
      const size=Number(node.getAttribute('size'));if(size>=1&&size<=7)el.style.fontSize=[0,8,10,12,14,18,24,36][size]+'pt';
      const face=node.getAttribute('face'),color=node.getAttribute('color');if(face&&face.length<100)el.style.fontFamily=face;if(color)el.style.color=color;
    }
    const sizes={'xx-small':8,'x-small':10,'small':10,'medium':12,'large':14,'x-large':18,'xx-large':24,'xxx-large':36};
    if(sizes[el.style.fontSize])el.style.fontSize=sizes[el.style.fontSize]+'pt';
    if(node.tagName==='A'){const raw=node.getAttribute('href')||'';const href=/^#word-heading-\d+$/.test(raw)?raw:safeLink(raw);if(href){el.href=href;el.rel='noopener noreferrer';}}
    if(node.tagName==='IMG'){
      const src=node.getAttribute('src');if(!imageData(src))return;el.src=src;el.alt=(node.getAttribute('alt')||'Зображення').slice(0,200);
      const imageStyle=node.getAttribute('data-word-image-style');
      if(Object.hasOwn(imagePresets,imageStyle))el.dataset.wordImageStyle=imageStyle;
      for(const attr of ['width','height']){const n=Number(node.getAttribute(attr));if(n>0&&n<=2000)el.setAttribute(attr,String(n));}
    }
    if(['TD','TH'].includes(node.tagName))for(const key of ['colspan','rowspan']){const n=Number(node.getAttribute(key));if(n>1&&n<=20)el.setAttribute(key,String(n));}
    for(const child of node.childNodes)copy(child,el,depth+1);parent.append(el);
  }
  for(const child of parsed.body.childNodes)copy(child,out);
  updateListLabels(out);
  return out.innerHTML||'<p><br></p>';
}
export function validate(raw){
  if(raw?.format!=='informatyka-word'||raw.version!==1)throw new Error('Це не проєкт Word цієї платформи.');
  const doc={...blank(),html:cleanHTML(raw.html),theme:themeId(raw.theme),orientation:raw.orientation==='landscape'?'landscape':'portrait',margin:Number(raw.margin),header:String(raw.header||'').slice(0,200),footer:String(raw.footer||'').slice(0,200),pageNumbers:raw.pageNumbers===true};
  if(!Number.isFinite(doc.margin)||doc.margin<10||doc.margin>40)throw new Error('Поля документа мають бути 10–40 мм.');
  const review=validateReview(raw.review,cleanHTML);
  if(review)doc.review=review;
  return doc;
}
export function projectBlob(doc){const value=JSON.stringify(validate(doc));if(value.length>MAX_SIZE)throw new Error('Документ завеликий: до 8 МБ.');return new Blob([value],{type:'application/json'});}
export async function readProject(blob){if(blob.size>MAX_SIZE)throw new Error('Документ завеликий: до 8 МБ.');let data;try{data=JSON.parse(await blob.text());}catch{throw new Error('Не вдалося прочитати проєкт Word.');}return validate(data);}
export function plainText(html){const box=document.createElement('div');box.innerHTML=cleanHTML(html);for(const formula of box.querySelectorAll('[data-word-math]'))formula.replaceWith(formula.getAttribute('data-word-math'));for(const br of box.querySelectorAll('br'))br.replaceWith('\n');for(const block of box.querySelectorAll('p,div,h1,h2,h3,h4,blockquote,li,tr'))block.append('\n');return box.textContent;}
export function escapeHTML(text){return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
