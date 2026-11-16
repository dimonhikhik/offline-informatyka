import { strFromU8,unzipSync } from '../../vendor/fflate/browser.js';

const relationshipNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageOrigin='https://presentation.invalid';
const supportedPart=/^(?:docProps\/core\.xml|ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|(?:slides|slideLayouts|slideMasters)\/(?:_rels\/)?[^/]+\.xml(?:\.rels)?|(?:notesSlides|theme)\/[^/]+\.xml|media\/[^/]+))$/i;
const first=(node,name)=>[...(node?.children||[])].find(child=>child.localName===name);
const descendants=(node,name)=>[...(node?.getElementsByTagNameNS('*',name)||[])];
const descendant=(node,name)=>node?.getElementsByTagNameNS('*',name)[0];
const attr=(node,name)=>node?.getAttribute(name)||'';
const relationshipId=(node,name='id')=>node?.getAttributeNS(relationshipNS,name)||attr(node,'r:'+name);
const attrNumber=(node,name,fallback=0)=>attr(node,name)&&Number.isFinite(Number(attr(node,name)))?Number(attr(node,name)):fallback;
const isTrue=value=>value==='1'||value==='true';
const isFalse=value=>value==='0'||value==='false';
const yes=(node,name)=>isTrue(attr(node,name));
const hex=value=>/^[0-9a-f]{6}$/i.test(value)?'#'+value.toLowerCase():'';
const animationEffects={1:'appear',2:'fly',10:'fade',23:'zoom'};
const animationTriggers={clickEffect:'click',withEffect:'with',afterEffect:'after'};

function animationsFromSlide(timing){
  const animations=new Map();
  if(!timing)return {animations,skipped:false};
  let skipped=false;
  const candidates=descendants(timing,'cTn').filter(node=>node.hasAttribute('presetClass'));
  for(const node of candidates){
    const preset=attr(node,'presetID'),nodeType=attr(node,'nodeType');
    const effect=Object.hasOwn(animationEffects,preset)?animationEffects[preset]:'';
    const trigger=Object.hasOwn(animationTriggers,nodeType)?animationTriggers[nodeType]:'';
    const behavior=first(node,'childTnLst'),targets=descendants(behavior,'spTgt');
    const ids=new Set(targets.map(target=>attr(target,'spid')));
    const [id]=ids;
    let interactive=false;
    for(let parent=node.parentNode;parent&&parent!==timing;parent=parent.parentNode){
      if(attr(parent,'nodeType')==='interactiveSeq')interactive=true;
    }
    if(!effect||!trigger||interactive||attr(node,'presetClass')!=='entr'||ids.size!==1||!id||animations.has(id)){
      skipped=true;continue;
    }
    if(targets.some(target=>first(target,'txEl'))||
      effect==='fly'&&attr(node,'presetSubtype')!=='4'||
      attrNumber(first(first(node,'stCondLst'),'cond'),'delay')>0)skipped=true;
    const time=attrNumber(node,'dur')||descendants(behavior,'cTn').reduce((max,child)=>Math.max(max,attrNumber(child,'dur')),0);
    const duration=effect==='appear'||time<=0 ? .5 : time/1000;
    animations.set(id,{effect,trigger,duration,order:animations.size+1});
  }
  return {animations,skipped:skipped||!candidates.length};
}

function unzip(bytes){
  let count=0,total=0;
  try{
    return unzipSync(bytes,{filter(entry){
      if(++count>3000)throw Error('Забагато частин презентації.');
      if(!supportedPart.test(entry.name))return false;
      total+=entry.originalSize;
      if(total>64*1024*1024||entry.originalSize>15*1024*1024)throw Error('Розпакована презентація завелика.');
      return true;
    }});
  }catch(error){
    throw Error('Не вдалося відкрити презентацію без пароля. '+error.message);
  }
}

function parseXML(bytes){
  const text=strFromU8(bytes);
  if(/<!DOCTYPE/i.test(text))throw Error('Непідтримуваний XML презентації.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('Пошкоджений XML презентації.');
  return doc.documentElement;
}

function partPath(source,target){
  try{
    const url=new URL(target,packageOrigin+'/'+source);
    if(url.origin!==packageOrigin||url.search||url.hash)return '';
    const path=decodeURIComponent(url.pathname.slice(1));
    return supportedPart.test(path)?path:'';
  }catch{return '';}
}

function relationshipPart(part){
  const i=part.lastIndexOf('/');
  return part.slice(0,i+1)+'_rels/'+part.slice(i+1)+'.rels';
}

function readImage(bytes){
  if(!bytes||bytes.length>2200000)return '';
  const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78?'png':
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpeg':'';
  if(!mime)return '';
  let data='';
  for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:image/${mime};base64,${btoa(data)}`;
}

function colorAt(fill,palette,fallback=''){
  if(!fill)return fallback;
  const rgb=first(fill,'srgbClr'),system=first(fill,'sysClr'),scheme=first(fill,'schemeClr');
  return hex(attr(rgb,'val'))||hex(attr(system,'lastClr'))||palette[attr(scheme,'val')]||fallback;
}

function geometry(xfrm){
  const off=first(xfrm,'off'),ext=first(xfrm,'ext');
  if(!off||!ext)return null;
  return {x:attrNumber(off,'x'),y:attrNumber(off,'y'),w:attrNumber(ext,'cx'),h:attrNumber(ext,'cy')};
}

function groupChildCoordinates(xfrm,parent){
  const position=geometry(xfrm),inner=first(xfrm,'chOff'),extent=first(xfrm,'chExt');
  const iw=attrNumber(extent,'cx'),ih=attrNumber(extent,'cy');
  if(!position||!iw||!ih)return parent;
  const sx=position.w/iw,sy=position.h/ih;
  return {
    x:parent.x+(position.x-attrNumber(inner,'x')*sx)*parent.sx,
    y:parent.y+(position.y-attrNumber(inner,'y')*sy)*parent.sy,
    sx:parent.sx*sx,sy:parent.sy*sy
  };
}

function paragraphText(paragraph){
  return [...paragraph.children].map(item=>{
    if(item.localName==='br')return '\n';
    if(item.localName==='r'||item.localName==='fld')return first(item,'t')?.textContent||'';
    return '';
  }).join('');
}

function textContent(body){
  return [...(body?.children||[])].filter(node=>node.localName==='p').map(paragraphText).join('\n');
}

function placeholder(node){
  return first(first(first(node,'nvSpPr'),'nvPr'),'ph');
}

function placeholderMatch(node,root){
  const ph=placeholder(node);
  if(!ph)return null;
  const tree=first(first(root,'cSld'),'spTree');
  const shapes=[...(tree?.children||[])].filter(item=>item.localName==='sp'&&placeholder(item));
  const index=attr(ph,'idx'),type=attr(ph,'type')||'obj';
  const sameType=other=>{
    const value=attr(placeholder(other),'type')||'obj';
    return value===type||(['title','ctrTitle'].includes(type)&&['title','ctrTitle'].includes(value));
  };
  return index?shapes.find(item=>attr(placeholder(item),'idx')===index)||shapes.find(sameType):shapes.find(sameType);
}

const shapeTypes={
  rect:'rect',ellipse:'ellipse',roundRect:'roundRect',triangle:'triangle',diamond:'diamond',
  leftArrow:'arrow',rightArrow:'arrow',line:'line',lineInv:'line',straightConnector1:'line',star5:'star'
};
const alignments={l:'left',ctr:'center',r:'right',just:'justify',dist:'justify'};
const verticalAlignments={t:'top',ctr:'middle',b:'bottom'};
const identity={x:0,y:0,sx:1,sy:1};

export async function readPptx(file,filename,{object,safeLink}){
  const files=unzip(new Uint8Array(await file.arrayBuffer()));
  const xmlCache=new Map(),relCache=new Map(),imageCache=new Map(),warnings=new Set();
  const warn=value=>warnings.add(value);
  function part(path){
    if(!files[path])return null;
    if(!xmlCache.has(path))xmlCache.set(path,parseXML(files[path]));
    return xmlCache.get(path);
  }
  function relationships(path){
    if(!relCache.has(path)){
      const root=part(relationshipPart(path)),children=[...(root?.children||[])];
      relCache.set(path,new Map(children.filter(node=>node.localName==='Relationship').map(node=>{
        const target=attr(node,'Target'),external=attr(node,'TargetMode')==='External';
        return [attr(node,'Id'),{external,type:attr(node,'Type').split('/').at(-1),target:external?target:partPath(path,target)}];
      })));
    }
    return relCache.get(path);
  }
  function related(path,type){
    return [...relationships(path).values()].find(entry=>!entry.external&&entry.type===type)?.target||'';
  }
  function links(path,node){
    const click=descendant(node,'hlinkClick'),rel=relationships(path).get(relationshipId(click));
    return rel?.external?safeLink(rel.target):'';
  }
  function imagePart(id){
    if(!id)return '';
    if(!imageCache.has(id))imageCache.set(id,readImage(files[id]));
    return imageCache.get(id);
  }

  const source='ppt/presentation.xml',root=part(source),ids=first(root,'sldIdLst');
  const slidePaths=[...(ids?.children||[])].map(node=>relationships(source).get(relationshipId(node))?.target||'');
  if(!root||root.localName!=='presentation'||!slidePaths.length)throw Error('Файл не містить слайдів PowerPoint.');
  if(slidePaths.length>50)throw Error('У презентації може бути до 50 слайдів.');
  const dimensions=first(root,'sldSz'),width=attrNumber(dimensions,'cx',12192000),height=attrNumber(dimensions,'cy',6858000);
  if(width<=0||height<=0)throw Error('Некоректний розмір слайда.');
  const aspect=width/height>1.55?'wide':'standard';
  if(Math.abs(width/height-(aspect==='wide'?16/9:4/3))>.05)warn('Нестандартні пропорції слайдів адаптовано до підтримуваного формату.');
  const fromPoints=4/3;

  function paletteFor(slide,layout,master,masterPath){
    const theme=part(related(masterPath,'theme'));
    const scheme=descendant(theme,'clrScheme'),base={};
    for(const node of scheme?.children||[])base[node.localName]=colorAt(node,{});
    const map=first(first(slide,'clrMapOvr'),'overrideClrMapping')||first(first(layout,'clrMapOvr'),'overrideClrMapping')||first(master,'clrMap');
    const aliases={bg1:'lt1',tx1:'dk1',bg2:'lt2',tx2:'dk2',...Object.fromEntries([...(map?.attributes||[])].map(item=>[item.localName,item.value]))};
    return {...base,...Object.fromEntries(Object.entries(aliases).map(([key,value])=>[key,base[value]]))};
  }

  function bounds(xfrm,transform,fallback){
    const item=geometry(xfrm);
    if(!item)return fallback;
    return {
      x:(transform.x+item.x*transform.sx)*960/width,
      y:(transform.y+item.y*transform.sy)*540/height,
      w:item.w*transform.sx*960/width,
      h:item.h*transform.sy*540/height,
      rotation:((attrNumber(xfrm,'rot')/60000+540)%360)-180
    };
  }

  function textStyle(body,inheritedBody,palette,kind){
    const paragraph=first(body,'p'),ppr=first(paragraph,'pPr');
    const fallback=first(first(inheritedBody,'lstStyle'),'lvl1pPr')||first(first(inheritedBody,'p'),'pPr');
    const run=first(first(paragraph,'r'),'rPr'),defaultRun=first(ppr,'defRPr')||first(fallback,'defRPr');
    const value=key=>attr(run,key)||attr(defaultRun,key);
    const properties=first(body,'bodyPr'),inheritProperties=first(inheritedBody,'bodyPr');
    const inheritedColor=colorAt(first(defaultRun,'solidFill'),palette,palette.tx1||'#172033');
    const fill=first(run,'solidFill');
    const font=attr(first(run,'latin'),'typeface')||attr(first(defaultRun,'latin'),'typeface')||'Arial';
    const points=Number(value('sz'))/100;
    const alpha=descendant(fill,'alpha');
    return {
      font:font.startsWith('+')?'Arial':font,size:points?points*fromPoints:kind==='title'||kind==='ctrTitle'?44:32,
      bold:isTrue(value('b'))||(!value('b')&&(kind==='title'||kind==='ctrTitle')),italic:isTrue(value('i')),
      underline:Boolean(value('u')&&!['none','0','false'].includes(value('u'))),
      color:colorAt(fill,palette,inheritedColor),
      opacity:alpha?attrNumber(alpha,'val',100000)/1000:100,
      align:alignments[attr(ppr,'algn')||attr(fallback,'algn')]||'left',
      valign:verticalAlignments[attr(properties,'anchor')||attr(inheritProperties,'anchor')]||'top',
      bullets:first(ppr,'buNone')?'none':first(ppr,'buAutoNum')||first(fallback,'buAutoNum')?'number':
        first(ppr,'buChar')||first(fallback,'buChar')?'bullet':'none'
    };
  }

  function shapeStyle(properties,palette){
    const base=object('rect'),line=first(properties,'ln'),fill=first(properties,'solidFill');
    const alpha=descendant(fill||first(line,'solidFill'),'alpha');
    return {
      fill:colorAt(fill,palette,base.fill),stroke:colorAt(first(line,'solidFill'),palette,base.stroke),
      strokeWidth:first(line,'noFill')?0:attrNumber(line,'w',12700)*fromPoints/12700,
      opacity:alpha?attrNumber(alpha,'val',100000)/1000:100
    };
  }

  function readSlide(path){
    const slide=part(path);
    if(!slide||slide.localName!=='sld')throw Error('Не вдалося прочитати один зі слайдів.');
    const layoutPath=related(path,'slideLayout'),layout=part(layoutPath),masterPath=related(layoutPath,'slideMaster'),master=part(masterPath);
    const palette=paletteFor(slide,layout,master,masterPath);
    const common=first(slide,'cSld'),tree=first(common,'spTree'),list=[];
    const {animations,skipped}=animationsFromSlide(first(slide,'timing')),animatedShapes=new Set();
    const backgroundProperties=[slide,layout,master].map(node=>first(first(first(node,'cSld'),'bg'),'bgPr')).find(Boolean);
    const background=colorAt(first(backgroundProperties,'solidFill'),palette,palette.bg1||'#ffffff');
    if(first(backgroundProperties,'gradFill')||first(backgroundProperties,'blipFill'))warn('Градієнтні фони та фонові зображення спрощено.');
    function add(entry,node){
      if(list.length>=50){warn('На деяких слайдах відкрито перші 50 об’єктів.');return;}
      const id=attr(first(node.firstElementChild,'cNvPr'),'id'),animation=animations.get(id);
      if(animation){
        entry.animation={...animation};
        if(animatedShapes.has(id))entry.animation.trigger='with';
        animatedShapes.add(id);
      }
      list.push(entry);
    }
    function walk(container,transform,depth){
      if(depth>20){warn('Частину вкладених груп пропущено.');return;}
      for(const item of container?.children||[]){
        const type=item.localName;
        if(type==='grpSp'){
          const xfrm=first(first(item,'grpSpPr'),'xfrm');
          if(attrNumber(xfrm,'rot')||yes(xfrm,'flipH')||yes(xfrm,'flipV'))warn('Перетворення вкладених груп спрощено.');
          walk(item,groupChildCoordinates(xfrm,transform),depth+1);
        }else if(type==='sp'||type==='cxnSp'){
          const properties=first(item,'spPr'),kind=attr(placeholder(item),'type');
          const inherited=placeholderMatch(item,layout)||placeholderMatch(item,master);
          const title=kind==='title'||kind==='ctrTitle';
          const inheritance=first(first(inherited,'spPr'),'xfrm');
          const fallback={x:70,y:title?45:150,w:820,h:title?100:340};
          const position=bounds(first(properties,'xfrm')||inheritance,transform,fallback);
          const body=first(item,'txBody'),text=textContent(body);
          const shape=attr(first(properties,'prstGeom'),'prst');
          const shapeType=type==='cxnSp'?'line':Object.hasOwn(shapeTypes,shape)?shapeTypes[shape]:null;
          const line=first(properties,'ln');
          const hasDrawnShape=type==='cxnSp'||shapeType&&(!body||first(properties,'solidFill')||first(line,'solidFill'));
          if(shape&&!shapeType)warn('Нестандартні фігури мають спрощене оформлення.');
          if(first(properties,'gradFill')||first(properties,'blipFill'))warn('Градієнтні та графічні заливки фігур спрощено.');
          if(hasDrawnShape||(!body&&shape)){
            const orientation=shape==='leftArrow'?((position.rotation||0)+360)%360-180:position.rotation;
            add({...object(shapeType||'rect'),...position,...shapeStyle(properties,palette),rotation:orientation,link:links(path,item)},item);
          }
          if(text){
            const texts=descendants(body,'rPr');
            const styles=new Set(texts.map(style=>Array.from(style.attributes).filter(a=>['sz','b','i','u'].includes(a.localName)).map(a=>a.value).join('|')+
              attr(first(style,'latin'),'typeface')+colorAt(first(style,'solidFill'),palette)));
            if(styles.size>1)warn('Форматування окремих слів зведено до стилю текстового блока.');
            add({...object(),...position,text,...textStyle(body,first(inherited,'txBody'),palette,kind),link:links(path,item)},item);
          }
        }else if(type==='pic'){
          const blip=descendant(first(item,'blipFill'),'blip'),relation=relationships(path).get(relationshipId(blip,'embed'));
          const data=relation?.external?'':imagePart(relation?.target);
          if(!data){warn('Деякі рисунки пропущено. Імпорт підтримує вбудовані PNG та JPEG.');continue;}
          const properties=first(item,'spPr'),position=bounds(first(properties,'xfrm'),transform,object('image'));
          const sourceRect=descendant(first(item,'blipFill'),'srcRect');
          const fit=sourceRect?.attributes.length?'cover':'stretch';
          if(fit==='cover')warn('Обтинання зображень відтворено за центром.');
          const alt=attr(descendant(first(item,'nvPicPr'),'cNvPr'),'descr')||object('image').alt;
          const alpha=first(blip,'alphaModFix');
          add({...object('image'),...position,src:data,fit,alt,link:links(path,item),opacity:alpha?attrNumber(alpha,'amt',100000)/1000:100},item);
        }else if(type==='graphicFrame'){
          const table=descendant(item,'tbl');
          if(!table){warn('Діаграми та SmartArt пропущено.');continue;}
          const rows=[...table.children].filter(row=>row.localName==='tr');
          if(!rows.length)continue;
          const tableCells=rows.map(row=>[...row.children].filter(cell=>cell.localName==='tc'));
          const columnCount=tableCells.reduce((max,row)=>Math.max(max,row.length),1);
          if(rows.length>10||columnCount>8)warn('Великі таблиці скорочено до 10 рядків і 8 стовпців.');
          if(tableCells.some(row=>row.some(cell=>attr(cell,'rowSpan')||attr(cell,'gridSpan')||yes(cell,'hMerge')||yes(cell,'vMerge')))){
            warn('Об’єднані комірки відтворено як окремі.');
          }
          const cells=tableCells.slice(0,10).map(row=>row.slice(0,8).map(cell=>textContent(first(cell,'txBody'))));
          const header=first(rows[0],'tc'),properties=first(header,'tcPr'),options=first(table,'tblPr');
          const formatted=first(first(first(header,'txBody'),'p'),'r');
          const fill=colorAt(first(properties,'solidFill'),palette,object('table').fill);
          const head=options?.hasAttribute('firstRow')?yes(options,'firstRow'):yes(first(formatted,'rPr'),'b');
          const textFormat=textStyle(first(head?first(rows[1],'tc')||header:header,'txBody'),null,palette,'body');
          const border=first(properties,'lnL'),alpha=descendant(first(properties,'solidFill'),'alpha');
          add({...object('table'),...bounds(first(item,'xfrm'),transform,object('table')),cells,fill,
            head,
            stroke:colorAt(first(border,'solidFill'),palette,object('table').stroke),
            strokeWidth:first(border,'noFill')?0:attrNumber(border,'w',12700)*fromPoints/12700,
            ...textFormat,opacity:alpha?attrNumber(alpha,'val',100000)/1000:textFormat.opacity},item);
        }else if(type==='AlternateContent'||type==='oleObj'){
          warn('Мультимедіа та вбудовані об’єкти пропущено.');
        }
      }
    }
    walk(tree,identity,0);
    list.filter(entry=>entry.animation).sort((left,right)=>left.animation.order-right.animation.order)
      .forEach((entry,index)=>{entry.animation.order=index+1;});
    const notes=part(related(path,'notesSlide')),note=descendants(notes,'sp').find(node=>attr(placeholder(node),'type')==='body');
    const transition=first(slide,'transition');
    const effect=[...(transition?.children||[])].find(item=>['fade','wipe','push'].includes(item.localName))?.localName;
    if(transition?.children.length&&!effect)warn('Складні переходи пропущено.');
    if(skipped||animatedShapes.size<animations.size)warn('Частину анімацій об’єктів пропущено або спрощено.');
    return {
      title:attr(common,'name'),notes:textContent(first(note,'txBody')),background,objects:list,
      transition:effect||'none',advance:attrNumber(transition,'advTm')/1000,hidden:isFalse(attr(slide,'show'))
    };
  }

  const slides=slidePaths.map(readSlide),title=descendant(part('docProps/core.xml'),'title')?.textContent;
  return {
    format:'informatyka-slides',version:1,name:title||filename.replace(/\.pptx$/i,''),aspect,theme:'classic',slides,
    importWarnings:['PPTX імпортовано зі спрощенням. Для повторного редагування збережи проєкт.',...warnings]
  };
}
