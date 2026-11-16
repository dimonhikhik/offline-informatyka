import { columnSettings } from './formatting.js';
import { formulaXML } from './math.js';
import { updateContents } from './structure.js';
import { zipSync,strToU8 } from '../../vendor/fflate/browser.js';
import { cleanHTML,escapeHTML as x,safeLink } from './model.js';
import { documentThemes,imagePresets,paragraphStyleId,paragraphStyles,styleFor,tablePresets,themeId } from './styles.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function hex(value){if(/^#[a-f\d]{6}$/i.test(value))return value.slice(1);const m=String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?m.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):'000000';}
function pt(value,fallback=12){const n=parseFloat(value);return Number.isFinite(n)?n*(String(value).endsWith('px')?.75:String(value).endsWith('mm')?72/25.4:String(value).endsWith('cm')?72/2.54:1):fallback;}
function tableBorders(color){
  return '<w:tblBorders>'+['top','left','bottom','right','insideH','insideV']
    .map(side=>`<w:${side} w:val="single" w:sz="4" w:color="${hex(color)}"/>`).join('')+'</w:tblBorders>';
}
export function exportDocx(doc){
  const theme=themeId(doc.theme);
  const root=document.createElement('div');root.innerHTML=cleanHTML(doc.html);updateContents(root);let sectionType='nextPage';
  const parts={},rels=[],numberingInstances=[];let relIndex=0,imgIndex=0,nextNumberingId=3;
  const relation=(type,target,external=false)=>{const id=`rId${++relIndex}`;rels.push(`<Relationship Id="${id}" Type="${R}/${type}" Target="${x(target)}"${external?' TargetMode="External"':''}/>`);return id;};
  function props(s){
    const toggle=(name,value)=>value===undefined?'':value?`<w:${name}/>`:`<w:${name} w:val="0"/>`;
    const size=s.size?Math.round(s.size*2):null;
    return `${s.font?`<w:rFonts w:ascii="${x(s.font)}" w:hAnsi="${x(s.font)}"/>`:''}${toggle('b',s.bold)}${toggle('i',s.italic)}${toggle('strike',s.strike)}${s.color?`<w:color w:val="${hex(s.color)}"/>`:''}${size?`<w:sz w:val="${size}"/>`:''}${s.underline?'<w:u w:val="single"/>':''}${s.bg?`<w:shd w:fill="${hex(s.bg)}"/>`:''}${s.vertical?`<w:vertAlign w:val="${s.vertical}"/>`:''}`;
  }
  function image(node,linkId){
    const match=node.src.match(/^data:image\/(png|jpeg);base64,(.*)$/is);if(!match)return '';
    const index=++imgIndex,ext=match[1].toLowerCase()==='jpeg'?'jpg':'png',target=`media/image${index}.${ext}`;
    const raw=atob(match[2]);parts[`word/${target}`]=Uint8Array.from(raw,c=>c.charCodeAt(0));const id=relation('image',target);
    const width=Math.max(1,Math.min(650,parseFloat(node.style.width)||Number(node.getAttribute('width'))||300));
    const height=Math.max(1,Math.min(900,parseFloat(node.style.height)||Number(node.getAttribute('height'))||200)),cx=Math.round(width*9525),cy=Math.round(height*9525);
    const style=imagePresets[node.dataset.wordImageStyle],radius=style?.radius;
    const adjustment=radius?Math.min(50000,Math.round(100000*radius/Math.min(width,height))):0;
    const geometry=radius?`<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjustment}"/></a:avLst></a:prstGeom>`:'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    const border=style?.border?`<a:ln w="${Math.round(style.border.width*9525)}"><a:solidFill><a:srgbClr val="${hex(style.border.color)}"/></a:solidFill></a:ln>`:'';
    const shadow=style?.shadow?'<a:effectLst><a:outerShdw blurRad="66675" dist="34343" dir="3378061" algn="ctr" rotWithShape="0"><a:srgbClr val="172033"><a:alpha val="44000"/></a:srgbClr></a:outerShdw></a:effectLst>':'';
    const effectExtent=shadow?'<wp:effectExtent l="0" t="0" r="85725" b="95250"/>':'';
    const click=linkId?`<a:hlinkClick r:id="${linkId}"/>`:'';
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>${effectExtent}<wp:docPr id="${index}" name="Зображення ${index}" descr="${x(node.alt)}">${click}</wp:docPr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="image${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${geometry}${border}${shadow}</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  function inline(node,inherited={},pictureLink=''){
    if(node.nodeType===3)return `<w:r><w:rPr>${props(inherited)}</w:rPr><w:t xml:space="preserve">${x(node.textContent)}</w:t></w:r>`;
    if(node.nodeType!==1)return '';
    if(node.hasAttribute('data-word-math'))return formulaXML(node.getAttribute('data-word-math'));
    if(node.tagName==='BR')return '<w:r><w:br/></w:r>';
    if(node.tagName==='IMG')return image(node,pictureLink);
    if(['UL','OL','TABLE'].includes(node.tagName))return '';
    const s={...inherited},style=node.style,tag=node.tagName;
    if(['B','STRONG'].includes(tag)||Number(style.fontWeight)>=600||style.fontWeight==='bold')s.bold=true;
    if(style.fontWeight==='normal')s.bold=false;
    if(['I','EM'].includes(tag)||style.fontStyle==='italic')s.italic=true;
    if(style.fontStyle==='normal')s.italic=false;
    if(tag==='U'||style.textDecoration.includes('underline'))s.underline=true;
    if(['S','STRIKE'].includes(tag)||style.textDecoration.includes('line-through'))s.strike=true;
    if(tag==='SUB'||tag==='SUP')s.vertical=tag==='SUB'?'subscript':'superscript';
    if(style.color)s.color=style.color;if(style.backgroundColor)s.bg=style.backgroundColor;
    if(style.fontSize)s.size=pt(style.fontSize);if(style.fontFamily)s.font=style.fontFamily.split(',')[0].replaceAll('"','').replaceAll("'",'');
    const href=tag==='A'?node.getAttribute('href')||'':'',external=href?safeLink(href):'';
    const linkId=external?relation('hyperlink',external,true):'';
    const value=[...node.childNodes].map(n=>inline(n,s,linkId||pictureLink)).join('');
    if(/^#word-heading-\d+$/.test(href))return `<w:hyperlink w:anchor="${x(href.slice(1))}">${value}</w:hyperlink>`;
    if(linkId)return `<w:hyperlink r:id="${linkId}">${value}</w:hyperlink>`;
    return value;
  }
  function paragraph(node,numbering='',depth=0){
    if(node.hasAttribute?.('data-word-list-level')){numbering='3';depth=Number(node.getAttribute('data-word-list-level'))-1;}
    const s=node.style,align=['left','center','right','justify'].includes(s.textAlign)?s.textAlign:'';
    const key=paragraphStyleId(node),style=paragraphStyles[key];
    const spacing=[
      s.marginTop?`w:before="${Math.round(pt(s.marginTop,0)*20)}"`:'',
      s.marginBottom?`w:after="${Math.round(pt(s.marginBottom,0)*20)}"`:'',
      s.lineHeight?`w:line="${Math.round((parseFloat(s.lineHeight)||styleFor(theme,key).line)*240)}" w:lineRule="auto"`:''
    ].filter(Boolean).join(' ');
    const indent=[
      s.marginLeft?`w:left="${Math.round(pt(s.marginLeft,0)*20)}"`:'',
      s.textIndent?`w:firstLine="${Math.round(pt(s.textIndent,0)*20)}"`:''
    ].filter(Boolean).join(' ');
    const outline=Number(node.dataset.wordOutlineLevel);
    const ppr=`${key==='normal'?'':`<w:pStyle w:val="${style.word}"/>`}${numbering?`<w:numPr><w:ilvl w:val="${Math.min(depth,8)}"/><w:numId w:val="${numbering}"/></w:numPr>`:''}${spacing?`<w:spacing ${spacing}/>`:''}${numbering?`<w:ind w:left="${720*(depth+1)}" w:hanging="360"/>`:indent?`<w:ind ${indent}/>`:''}${align?`<w:jc w:val="${align==='justify'?'both':align}"/>`:''}${outline?`<w:outlineLvl w:val="${outline-1}"/>`:''}`;
    const bookmark=/^word-heading-\d+$/.test(node.id||'')?Number(node.id.split('-').at(-1)):null;
    return `<w:p><w:pPr>${ppr}</w:pPr>${bookmark?`<w:bookmarkStart w:id="${bookmark}" w:name="${node.id}"/>`:''}${inline(node)}${bookmark?`<w:bookmarkEnd w:id="${bookmark}"/>`:''}</w:p>`;
  }
  function blocks(container,depth=0){let output='',pending=[];
    const flush=()=>{if(!pending.length)return;const p=document.createElement('p');for(const n of pending)p.append(n.cloneNode(true));output+=paragraph(p);pending=[];};
    for(const node of container.childNodes){
      if(node.nodeType===3&&!node.textContent.trim())continue;
      const tag=node.tagName;
      const kind=node.getAttribute?.('data-word-break');
      if(kind){flush();if(kind==='page')output+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';else{output+=`<w:p><w:pPr>${sectionProperties(sectionType)}</w:pPr></w:p>`;sectionType=kind==='section-continuous'?'continuous':'nextPage';}continue;}
      if(node.hasAttribute?.('data-word-columns')){
        flush();output+=`<w:p><w:pPr>${sectionProperties(sectionType)}</w:pPr></w:p>`;
        output+=blocks(node,depth)+`<w:p><w:pPr>${sectionProperties('continuous',columnSettings(node))}</w:pPr></w:p>`;sectionType='continuous';continue;
      }
      if(node.hasAttribute?.('data-word-toc')){
        flush();output+='<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Зміст</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>';
        const cache=document.createElement('div');for(const child of [...node.children].slice(1))cache.append(child.cloneNode(true));output+=blocks(cache)+'<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';continue;
      }
      if(tag==='UL'||tag==='OL'){flush();let listId='2';if(tag==='OL'){listId=String(++nextNumberingId);numberingInstances.push(`<w:num w:numId="${listId}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${Math.min(depth,8)}"><w:startOverride w:val="${Number(node.getAttribute('start'))||1}"/></w:lvlOverride></w:num>`);}for(const li of node.children){if(li.tagName!=='LI')continue;output+=paragraph(li,listId,depth);for(const list of li.children)if(['UL','OL'].includes(list.tagName)||list.hasAttribute('data-word-columns')){const wrap=document.createElement('div');wrap.append(list.cloneNode(true));output+=blocks(wrap,depth+1);}}}
      else if(tag==='TABLE'){
        flush();const percent=node.style.width.endsWith('%')?Math.max(1,Math.min(100,parseFloat(node.style.width))):100;
        const pageWidth=(doc.orientation==='landscape'?16838:11906)-2*Math.round(doc.margin*56.6929),absolute=/[a-z]/i.test(node.style.width)&&!node.style.width.endsWith('%'),tableWidth=absolute?pt(node.style.width)*20:pageWidth*percent/100;
        const firstRow=node.rows[0],columns=firstRow?[...firstRow.cells]:[];
        const fractions=columns.map(c=>c.style.width.endsWith('%')?parseFloat(c.style.width)/100:c.style.width?pt(c.style.width)*20/tableWidth:1/(columns.length||1));
        const preset=tablePresets[node.dataset.wordTableStyle];
        const style=preset?`<w:tblStyle w:val="${preset.word}"/>`:'';
        const look=preset?`<w:tblLook w:val="${preset.band?'0420':'0620'}" w:firstRow="1" w:noHBand="${preset.band?'0':'1'}" w:noVBand="1"/>`:'';
        output+=`<w:tbl><w:tblPr>${style}<w:tblW w:w="${Math.round(absolute?tableWidth:percent*50)}" w:type="${absolute?'dxa':'pct'}"/>${tableBorders(preset?.border||'#64748b')}<w:tblLayout w:type="fixed"/>${look}</w:tblPr>`;
        output+='<w:tblGrid>'+fractions.map(n=>`<w:gridCol w:w="${Math.round(tableWidth*n)}"/>`).join('')+'</w:tblGrid>';
        for(const row of node.rows){
          const height=pt(row.style.height,0)*20;
          output+='<w:tr>'+(height?`<w:trPr><w:trHeight w:val="${Math.round(height)}" w:hRule="atLeast"/></w:trPr>`:'');
          const usePresetFill=preset&&(row.rowIndex===0||(row.rowIndex%2===1&&preset.band));
          for(const cell of row.cells){const fill=cell.style.backgroundColor||row.style.backgroundColor||node.style.backgroundColor||(usePresetFill?'#ffffff':'');
            const percentWidth=cell.style.width.endsWith('%'),width=cell.style.width?Math.round(percentWidth?parseFloat(cell.style.width)*50:pt(cell.style.width)*20):null;
            const borders=['top','left','bottom','right'].map(side=>{const cap=side[0].toUpperCase()+side.slice(1),style=cell.style['border'+cap+'Style'];if(!style)return '';const kind={solid:'single',double:'double',dashed:'dashed',dotted:'dotted',none:'nil'}[style]||'single';return `<w:${side} w:val="${kind}" w:sz="${Math.max(2,Math.round(pt(cell.style['border'+cap+'Width'],.5)*8))}" w:color="${hex(cell.style['border'+cap+'Color']||'#64748b')}"/>`;}).join('');
            const vertical={top:'top',middle:'center',bottom:'bottom'}[cell.style.verticalAlign];
            output+=`<w:tc><w:tcPr>${width?`<w:tcW w:w="${width}" w:type="${percentWidth?'pct':'dxa'}"/>`:''}${cell.colSpan>1?`<w:gridSpan w:val="${cell.colSpan}"/>`:''}${borders?`<w:tcBorders>${borders}</w:tcBorders>`:''}${fill?`<w:shd w:val="clear" w:fill="${hex(fill)}"/>`:''}${vertical?`<w:vAlign w:val="${vertical}"/>`:''}</w:tcPr>${blocks(cell)||'<w:p/>'}</w:tc>`;
          }output+='</w:tr>';
        }output+='</w:tbl><w:p/>';
      }
      else if(['P','DIV','H1','H2','H3','H4','BLOCKQUOTE'].includes(tag)){flush();if([...node.children].some(n=>['P','DIV','TABLE','UL','OL'].includes(n.tagName)))output+=blocks(node,depth);else output+=paragraph(node);}
      else pending.push(node);
    }flush();return output;
  }
  relation('settings','settings.xml');
  parts['word/settings.xml']=strToU8(declaration+'<w:settings xmlns:w="'+W+'"><w:updateFields w:val="true"/></w:settings>');
  relation('styles','styles.xml');relation('numbering','numbering.xml');
  const headerId=relation('header','header1.xml'),footerId=relation('footer','footer1.xml');
  const footerText=`<w:p><w:r><w:t xml:space="preserve">${x(doc.footer)}${doc.pageNumbers?' · ':''}</w:t></w:r>${doc.pageNumbers?'<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>':''}</w:p>`;
  parts['word/header1.xml']=strToU8(`${declaration}<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>${x(doc.header)}</w:t></w:r></w:p></w:hdr>`);
  parts['word/footer1.xml']=strToU8(`${declaration}<w:ftr xmlns:w="${W}">${footerText}</w:ftr>`);
  const landscape=doc.orientation==='landscape',margin=Math.round(doc.margin*56.6929);
  function sectionProperties(type,columns=null){const right=columns?Math.round((landscape?29.7:21)*566.929-margin-(columns.count*columns.width+(columns.count-1)*columns.gap)*566.929):margin;const cols=columns?`<w:cols w:num="${columns.count}" w:equalWidth="0" w:space="${Math.round(columns.gap*566.929)}">${Array.from({length:columns.count},()=>`<w:col w:w="${Math.round(columns.width*566.929)}" w:space="${Math.round(columns.gap*566.929)}"/>`).join('')}</w:cols>`:'<w:cols w:num="1"/>';return `<w:sectPr><w:headerReference w:type="default" r:id="${headerId}"/><w:footerReference w:type="default" r:id="${footerId}"/><w:type w:val="${type}"/><w:pgSz w:w="${landscape?16838:11906}" w:h="${landscape?11906:16838}"${landscape?' w:orient="landscape"':''}/><w:pgMar w:top="${margin}" w:right="${right}" w:bottom="${margin}" w:left="${margin}" w:header="567" w:footer="567" w:gutter="0"/>${cols}</w:sectPr>`;}
  const body=blocks(root)||'<w:p/>';
  parts['word/document.xml']=strToU8(`${declaration}<w:document xmlns:w="${W}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${sectionProperties(sectionType)}</w:body></w:document>`);
  const namedStyles=Object.entries(paragraphStyles).map(([key,definition])=>{
    const style=styleFor(theme,key),normal=key==='normal';
    const name=definition.level?`heading ${definition.level}`:definition.word;
    const outline=definition.level?`<w:outlineLvl w:val="${definition.level-1}"/>`:'';
    const keep=definition.level||key==='title'||key==='subtitle'?'<w:keepNext/>':'';
    const border=key==='quote'?`<w:pBdr><w:left w:val="single" w:sz="8" w:space="6" w:color="${hex(documentThemes[theme].accent)}"/></w:pBdr>`:'';
    const ind=key==='quote'?'<w:ind w:left="240"/>':'';
    return `<w:style w:type="paragraph"${normal?' w:default="1"':''} w:styleId="${definition.word}"><w:name w:val="${name}"/>${normal?'':'<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'}<w:qFormat/><w:pPr>${keep}${border}<w:spacing w:before="${style.before*20}" w:after="${style.after*20}" w:line="${Math.round(style.line*240)}" w:lineRule="auto"/>${ind}${outline}</w:pPr><w:rPr>${props({...style,bold:style.bold||undefined,italic:style.italic||undefined})}</w:rPr></w:style>`;
  }).join('');
  const namedTableStyles=Object.values(tablePresets).map(preset=>{
    const fill=(type,color)=>`<w:tblStylePr w:type="${type}"><w:tcPr><w:shd w:val="clear" w:fill="${hex(color)}"/></w:tcPr></w:tblStylePr>`;
    return `<w:style w:type="table" w:styleId="${preset.word}"><w:name w:val="${x(preset.label)}"/><w:qFormat/><w:tblPr>${tableBorders(preset.border)}</w:tblPr>${fill('firstRow',preset.header)}${preset.band?fill('band1Horz',preset.band):''}</w:style>`;
  }).join('');
  parts['word/styles.xml']=strToU8(`${declaration}<w:styles xmlns:w="${W}">${namedStyles}${namedTableStyles}</w:styles>`);
  parts['word/numbering.xml']=strToU8(`${declaration}<w:numbering xmlns:w="${W}">${[1,2,3].map(id=>`<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="multilevel"/>${Array.from({length:9},(_,level)=>`<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${id!==2?'decimal':'bullet'}"/><w:lvlText w:val="${id!==2?'%'+(level+1)+(id===3&&level===1?')':'.'):'•'}"/><w:pPr><w:ind w:left="${720*(level+1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`).join('')}${numberingInstances.join('')}</w:numbering>`);
  parts['word/_rels/document.xml.rels']=strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  parts['_rels/.rels']=strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
  parts['[Content_Types].xml']=strToU8(`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>${[['settings','settings'],['document','document.main'],['styles','styles'],['numbering','numbering'],['header1','header'],['footer1','footer']].map(([part,type])=>`<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('')}</Types>`);
  return new Blob([zipSync(parts,{level:6})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
