import { styleColumns } from './formatting.js';
import { mathSource,formulaHTML } from './math.js';
import { breakHTML,updateContents } from './structure.js';
import { unzipSync,strFromU8 } from '../../vendor/fflate/browser.js';
import { blank,validate,safeLink,MAX_SIZE } from './model.js';
import { documentThemes,isStyleAttribute,paragraphStyleId,paragraphStyles,styleFor,tablePresets } from './styles.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PIC='http://schemas.openxmlformats.org/drawingml/2006/picture';
const children=(node,name)=>[...(node?.children||[])].filter(n=>n.localName===name);
const first=(node,name)=>children(node,name)[0];
const val=(node,key='val')=>node?.getAttributeNS(W,key)||node?.getAttribute('w:'+key)||'';
const styleIds=new Map(Object.entries(paragraphStyles).map(([key,style])=>[style.word.toLowerCase(),key]));
const tableStyleIds=new Map(Object.entries(tablePresets).map(([key,style])=>[style.word,key]));
function importedTheme(styles){
  const normal=children(styles,'style').find(node=>val(node,'type')==='paragraph'&&val(node,'styleId')==='Normal');
  const run=first(normal,'rPr'),spacing=first(first(normal,'pPr'),'spacing');
  return Object.keys(documentThemes).find(key=>{
    const style=styleFor(key,'normal');
    return val(first(run,'rFonts'),'ascii')===style.font&&Number(val(first(run,'sz')))===style.size*2&&
      Number(val(spacing,'after'))===style.after*20&&Number(val(spacing,'line'))===Math.round(style.line*240);
  })||'classic';
}
function xml(bytes){const text=strFromU8(bytes);if(/<!DOCTYPE/i.test(text))throw new Error('Непідтримуваний XML у DOCX.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Пошкоджений XML у DOCX.');return doc;}
function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
export async function importDocx(blob){
  if(blob.size>MAX_SIZE)throw new Error('DOCX має бути не більшим за 8 МБ.');
  let total=0,count=0;
  let files;try{files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:file=>{
    if(++count>2000)throw new Error('Надто багато частин DOCX.');total+=file.originalSize;
    if(total>32*1024*1024||file.originalSize>12*1024*1024)throw new Error('Розпакований DOCX завеликий.');
    return /^(word\/(document\.xml|styles\.xml|numbering\.xml|_rels\/document\.xml\.rels|header[^/]*\.xml|footer[^/]*\.xml|media\/[^/]+))$/.test(file.name);
  }});}catch(error){throw new Error(`Не вдалося відкрити DOCX без пароля. ${error.message}`);}
  if(!files['word/document.xml'])throw new Error('Файл не містить документа Word.');
  const docxml=xml(files['word/document.xml']),body=docxml.getElementsByTagNameNS(W,'body')[0];if(!body)throw new Error('Непідтримувана структура DOCX.');
  const rels=new Map();
  if(files['word/_rels/document.xml.rels'])for(const r of xml(files['word/_rels/document.xml.rels']).documentElement.children)rels.set(r.getAttribute('Id'),{target:r.getAttribute('Target')||'',external:r.getAttribute('TargetMode')==='External'});
  const resolve=id=>{const r=rels.get(id);if(!r||r.external)return null;const path=r.target.startsWith('/')?r.target.slice(1):'word/'+r.target;return path.includes('..')?null:files[path];};
  const externalLink=id=>{const rel=rels.get(id);return rel?.external?safeLink(rel.target):'';};
  const listTypes=new Map(),practiceLists=new Set(),listStarts=new Map();
  if(files['word/numbering.xml']){const n=xml(files['word/numbering.xml']).documentElement,abstracts=new Map();for(const a of children(n,'abstractNum'))abstracts.set(val(a,'abstractNumId'),val(first(first(a,'lvl'),'numFmt'))==='bullet'?'ul':'ol');for(const item of children(n,'num'))listTypes.set(val(item,'numId'),abstracts.get(val(first(item,'abstractNumId')))||'ol');}
  if(files['word/numbering.xml']){const numbering=xml(files['word/numbering.xml']).documentElement;const ids=new Set(children(numbering,'abstractNum').filter(a=>children(a,'lvl').some(l=>val(l,'ilvl')==='1'&&val(first(l,'lvlText'))==='%2)')).map(a=>val(a,'abstractNumId')));for(const n of children(numbering,'num'))if(ids.has(val(first(n,'abstractNumId'))))practiceLists.add(val(n,'numId'));}
  if(files['word/numbering.xml'])for(const n of children(xml(files['word/numbering.xml']).documentElement,'num')){const start=Number(val(first(first(n,'lvlOverride'),'startOverride')));if(start>=1)listStarts.set(val(n,'numId'),start);}
  const container=document.createElement('div');
  function run(node,parent,insideLink=false){
    const span=document.createElement('span'),pr=first(node,'rPr');
    const enabled=name=>{const el=first(pr,name);return el&&!['0','false','off','none'].includes(val(el));};
    if(first(pr,'b'))span.style.fontWeight=enabled('b')?'bold':'normal';
    if(first(pr,'i'))span.style.fontStyle=enabled('i')?'italic':'normal';
    span.style.textDecoration=[enabled('u')?'underline':'',enabled('strike')?'line-through':''].filter(Boolean).join(' ');
    const color=val(first(pr,'color')),shade=val(first(pr,'shd'),'fill');if(/^[a-f\d]{6}$/i.test(color))span.style.color='#'+color;if(/^[a-f\d]{6}$/i.test(shade))span.style.backgroundColor='#'+shade;
    const size=Number(val(first(pr,'sz')));if(size>=12&&size<=144)span.style.fontSize=(size/2)+'pt';
    const font=val(first(pr,'rFonts'),'ascii');if(font)span.style.fontFamily=font;
    for(const item of node.children){
      if(item.localName==='t')span.append(item.textContent);if(item.localName==='tab')span.append('\t');if(['br','cr'].includes(item.localName))span.append(document.createElement('br'));
      if(item.localName==='drawing'){
        const blip=item.getElementsByTagNameNS('*','blip')[0],data=resolve(blip?.getAttributeNS(R,'embed'));if(!data||data.length>2*1024*1024)continue;
        const png=data[0]===137&&data[1]===80,jpeg=data[0]===255&&data[1]===216;if(!png&&!jpeg)continue;
        const img=document.createElement('img'),extent=item.getElementsByTagNameNS(WP,'extent')[0];
        const properties=item.getElementsByTagNameNS(WP,'docPr')[0],pictureProperties=item.getElementsByTagNameNS(PIC,'cNvPr')[0];
        img.src=`data:image/${png?'png':'jpeg'};base64,${base64(data)}`;
        img.alt=properties?.getAttribute('descr')||pictureProperties?.getAttribute('descr')||'Зображення з DOCX';
        const w=Number(extent?.getAttribute('cx'))/9525,h=Number(extent?.getAttribute('cy'))/9525;
        img.width=Math.max(1,Math.min(650,w||300));img.height=Math.max(1,Math.min(900,h||200));
        const shape=item.getElementsByTagNameNS(PIC,'spPr')[0];
        const geometry=shape?.getElementsByTagNameNS(A,'prstGeom')[0]?.getAttribute('prst');
        const shadow=shape?.getElementsByTagNameNS(A,'outerShdw')[0],border=shape?.getElementsByTagNameNS(A,'ln')[0];
        if(shadow)img.dataset.wordImageStyle='shadow';
        else if(geometry==='roundRect')img.dataset.wordImageStyle='rounded';
        else if(border?.getElementsByTagNameNS(A,'solidFill').length)img.dataset.wordImageStyle='frame';
        const click=properties?.getElementsByTagNameNS(A,'hlinkClick')[0]||pictureProperties?.getElementsByTagNameNS(A,'hlinkClick')[0];
        const href=insideLink?'':externalLink(click?.getAttributeNS(R,'id'));
        if(href){const anchor=document.createElement('a');anchor.href=href;anchor.append(img);span.append(anchor);}
        else span.append(img);
      }
    }parent.append(span);
  }
  function appendMath(node,parent){try{const span=document.createElement('span');span.innerHTML=formulaHTML(mathSource(node));parent.append(span.firstChild);}catch{const fallback=document.createElement('span');fallback.textContent='[Формула: '+[...node.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')+']';parent.append(fallback);}}
  function paragraph(p){
    const pr=first(p,'pPr'),style=val(first(pr,'pStyle')).toLowerCase().replace(/\s+/g,''),key=styleIds.get(style)||'normal';
    const el=document.createElement(paragraphStyles[key].tag);
    if(isStyleAttribute(el.tagName,key))el.dataset.wordStyle=key;
    const outline=val(first(pr,'outlineLvl'));
    if(/^[0-8]$/.test(outline))el.dataset.wordOutlineLevel=String(Number(outline)+1);
    const align=val(first(pr,'jc'));if(['left','center','right','both'].includes(align))el.style.textAlign=align==='both'?'justify':align;
    const spacing=first(pr,'spacing'),indent=first(pr,'ind');
    if(val(spacing,'after'))el.style.marginBottom=(Number(val(spacing,'after'))/20)+'pt';
    if(val(spacing,'before'))el.style.marginTop=(Number(val(spacing,'before'))/20)+'pt';
    if(val(spacing,'line')&&(!val(spacing,'lineRule')||val(spacing,'lineRule')==='auto'))el.style.lineHeight=String(Number(val(spacing,'line'))/240);
    if(val(indent,'left'))el.style.marginLeft=(Number(val(indent,'left'))/20)+'pt';if(val(indent,'firstLine'))el.style.textIndent=(Number(val(indent,'firstLine'))/20)+'pt';
    for(const child of p.children){if(['oMath','oMathPara'].includes(child.localName))appendMath(child,el);if(child.localName==='r')run(child,el);if(child.localName==='hyperlink'){
      const anchor=val(child,'anchor'),href=externalLink(child.getAttributeNS(R,'id'))||(/^word-heading-\d+$/.test(anchor)?'#'+anchor:'');
      const link=document.createElement(href?'a':'span');
      if(href)link.href=href;
      for(const r of children(child,'r'))run(r,link,Boolean(href));
      el.append(link);
    }}if(!el.childNodes.length)el.append(document.createElement('br'));return el;
  }
  function blocks(source,target){let lastList=null,lastNum='',inToc=false,sectionStart=target.children.length;
    function wrapColumns(section){const cols=first(section,'cols'),items=children(cols,'col'),count=Number(val(cols,'num'))||items.length;if(![2,3].includes(count))return;const gap=Number(val(cols,'space')||val(items[0],'space')||567)/566.929;const width=Number(val(items[0],'w')||3969)/566.929;const wrap=document.createElement('div');wrap.setAttribute('data-word-columns',count);wrap.setAttribute('data-column-width',Math.round(width*100)/100);wrap.setAttribute('data-column-gap',Math.round(gap*100)/100);styleColumns(wrap);const nodes=[...target.children].slice(sectionStart);if(nodes.length){nodes[0].before(wrap);wrap.append(...nodes);}}

    for(const node of source.children){
      if(node.localName==='oMathPara'){const p=document.createElement('p');appendMath(node,p);target.append(p);continue;}
      if(node.localName==='sdt'){const content=first(node,'sdtContent');if(content)blocks(content,target);continue;}
      if(node.localName==='p'){
        const instructions=[...node.getElementsByTagNameNS(W,'instrText')].map(n=>n.textContent).join('');
        const fields=[...node.getElementsByTagNameNS(W,'fldChar')],ends=fields.some(n=>val(n,'fldCharType')==='end');
        if(/\bTOC\b/.test(instructions)){if(target.lastElementChild?.textContent.trim()==='Зміст')target.lastElementChild.remove();const toc=document.createElement('div');toc.setAttribute('data-word-toc','true');target.append(toc);inToc=!ends;continue;}
        if(inToc){if(ends)inToc=false;continue;}
        const breaks=[...node.getElementsByTagNameNS(W,'br')].filter(n=>val(n,'type')==='page');
        if(breaks.length&&!node.getElementsByTagNameNS(W,'t').length){const wrap=document.createElement('div');wrap.innerHTML=breakHTML('page');target.append(wrap.firstChild);continue;}
        const section=first(first(node,'pPr'),'sectPr');
        if(section){
          let next=node.nextElementSibling,nextSection;
          while(next){nextSection=next.localName==='sectPr'?next:first(first(next,'pPr'),'sectPr');if(nextSection)break;next=next.nextElementSibling;}
          const p=paragraph(node);if(p.textContent.trim())target.append(p);
          wrapColumns(section);
          const wrap=document.createElement('div');wrap.innerHTML=breakHTML(val(first(nextSection,'type'))==='continuous'?'section-continuous':'section-next');target.append(wrap.firstChild);lastList=null;sectionStart=target.children.length;continue;
        }
        const p=paragraph(node),num=val(first(first(first(node,'pPr'),'numPr'),'numId'));
        if(practiceLists.has(num)){p.setAttribute('data-word-list-level',Math.min(3,Number(val(first(first(first(node,'pPr'),'numPr'),'ilvl')))+1));target.append(p);lastList=null;lastNum='';}
        else if(num&&num!=='0'){
          if(!lastList||lastNum!==num){lastList=document.createElement(listTypes.get(num)||'ol');if(lastList.tagName==='OL'&&listStarts.has(num))lastList.setAttribute('start',String(listStarts.get(num)));target.append(lastList);lastNum=num;}
          const li=document.createElement('li'),key=paragraphStyleId(p);
          if(isStyleAttribute('LI',key))li.dataset.wordStyle=key;
          if(p.dataset.wordOutlineLevel)li.dataset.wordOutlineLevel=p.dataset.wordOutlineLevel;
          li.style.cssText=p.style.cssText;li.append(...p.childNodes);lastList.append(li);
        }
        else{target.append(p);lastList=null;lastNum='';}
      }else if(node.localName==='sectPr'){wrapColumns(node);sectionStart=target.children.length;}else if(node.localName==='tbl'){
        lastList=null;const table=document.createElement('table'),tbody=document.createElement('tbody');table.append(tbody);
        const tableProps=first(node,'tblPr'),styleKey=tableStyleIds.get(val(first(tableProps,'tblStyle'))),preset=tablePresets[styleKey];
        if(styleKey)table.dataset.wordTableStyle=styleKey;
        const look=first(tableProps,'tblLook'),headerEnabled=!['0','false','off'].includes(val(look,'firstRow'));
        const bandEnabled=!['1','true','on'].includes(val(look,'noHBand'));
        const tw=first(tableProps,'tblW');if(val(tw,'type')==='dxa'&&Number(val(tw,'w'))>0)table.style.width=(Number(val(tw,'w'))/566.929)+'cm';if(val(tw,'type')==='pct'){const width=Number(val(tw,'w'))/50;if(width>0&&width<=100)table.style.width=width+'%';}
        const grid=children(first(node,'tblGrid'),'gridCol').map(c=>Number(val(c,'w'))),gridTotal=grid.reduce((a,b)=>a+b,0);
        for(const [rowIndex,row] of children(node,'tr').entries()){
          const tr=document.createElement('tr'),height=Number(val(first(first(row,'trPr'),'trHeight')))/15;if(height>0&&height<=2000)tr.style.height=height+'px';
          const presetFill=rowIndex===0&&headerEnabled?preset?.header:rowIndex%2===1&&bandEnabled?preset?.band:'';
          let column=0;
          for(const cell of children(row,'tc')){
            const td=document.createElement('td'),pr=first(cell,'tcPr'),span=Number(val(first(pr,'gridSpan'))),fill=val(first(pr,'shd'),'fill'),cw=first(pr,'tcW');if(span>1&&span<=20)td.colSpan=span;
            if(/^[a-f\d]{6}$/i.test(fill))td.style.backgroundColor='#'+fill;
            else if(!fill&&presetFill)td.style.backgroundColor=presetFill;
            const width=val(cw,'type')==='pct'?Number(val(cw,'w'))/50:gridTotal?grid.slice(column,column+td.colSpan).reduce((a,b)=>a+b,0)/gridTotal*100:0;
            if(val(cw,'type')==='dxa'&&Number(val(cw,'w'))>0)td.style.width=(Number(val(cw,'w'))/566.929)+'cm';else if(width>0&&width<=100)td.style.width=width+'%';column+=td.colSpan;
            const vertical={top:'top',center:'middle',bottom:'bottom'}[val(first(pr,'vAlign'))];if(vertical)td.style.verticalAlign=vertical;
            for(const side of ['top','left','bottom','right']){
              const border=first(first(pr,'tcBorders'),side)||first(first(tableProps,'tblBorders'),side);
              if(!border){if(preset)td.style.setProperty('border-'+side,`.5pt solid ${preset.border}`);continue;}
              const style={single:'solid',double:'double',dashed:'dashed',dotted:'dotted',nil:'none',none:'none'}[val(border)]||'solid',size=Number(val(border,'sz'))/8,color=val(border,'color');
              td.style.setProperty('border-'+side,`${size>0?size:.5}pt ${style} ${/^[a-f\d]{6}$/i.test(color)?'#'+color:'#64748b'}`);
            }

            blocks(cell,td);tr.append(td);
          }tbody.append(tr);
        }target.append(table);
      }
    }
  }
  blocks(body,container);
  const model=blank(),section=first(body,'sectPr'),page=first(section,'pgSz'),margin=Number(val(first(section,'pgMar'),'left'))/56.6929;
  if(files['word/styles.xml'])model.theme=importedTheme(xml(files['word/styles.xml']).documentElement);
  model.orientation=val(page,'orient')==='landscape'?'landscape':'portrait';if(margin>=10&&margin<=40)model.margin=Math.round(margin);
  for(const [kind,key] of [['headerReference','header'],['footerReference','footer']]){const bytes=resolve(first(section,kind)?.getAttributeNS(R,'id'));if(bytes){const part=xml(bytes);model[key]=[...part.getElementsByTagNameNS(W,'t')].filter(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.localName==='fldSimple')return false;return true;}).map(n=>n.textContent).join('').slice(0,200);if(key==='footer')model.pageNumbers=[...part.getElementsByTagNameNS(W,'fldSimple')].some(n=>/PAGE/.test(val(n,'instr')));}}
  updateContents(container);model.html=container.innerHTML;
  return validate(model);
}
