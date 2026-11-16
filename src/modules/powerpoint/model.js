import { cleanName,color,library } from '../office/shared.js';
import { strFromU8,strToU8,unzipSync,zipSync } from '../../vendor/fflate/browser.js';

export const SLIDE_ASPECTS={wide:[16,9],standard:[4,3]};
export const SLIDE_FONTS=['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Courier New'];
export const SLIDE_THEMES={
  classic:{label:'Класична',background:'#ffffff',text:'#172033',accent:'#2682bd'},
  ink:{label:'Темна',background:'#14243b',text:'#ffffff',accent:'#75c6ff'},
  ocean:{label:'Океан',background:'#e6f6fb',text:'#0e3e57',accent:'#086580'},
  sunset:{label:'Захід сонця',background:'#fff2d9',text:'#623f22',accent:'#a74a22'},
  forest:{label:'Ліс',background:'#e7f4e9',text:'#153e31',accent:'#207b57'}
};
export const SLIDE_LAYOUTS={
  title:'Титульний',heading:'Заголовок',blank:'Порожній',twoColumn:'Дві колонки',
  section:'Розділ',imageCaption:'Ілюстрація з підписом',comparison:'Порівняння'
};
export const SHAPE_TYPES=['rect','ellipse','roundRect','triangle','diamond','arrow','line','star'];
export const ANIMATION_EFFECTS={none:'Без анімації',appear:'Поява',fade:'Плавна поява',fly:'Виліт знизу',zoom:'Збільшення'};
export const ANIMATION_TRIGGERS={click:'Після натискання',with:'Разом із попередньою',after:'Після попередньої'};
const TYPES=['text','image','table',...SHAPE_TYPES];
const MAX_PROJECT_BYTES=20*1024*1024;
const validImage=/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i;
const fontName=value=>SLIDE_FONTS.find(font=>font.toLowerCase()===String(value).toLowerCase())||'Arial';
const pick=(value,options,fallback)=>options.includes(value)?value:fallback;
const number=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const string=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';

export function animationFor(raw){
  const effect=Object.hasOwn(ANIMATION_EFFECTS,raw?.effect)?raw.effect:'none';
  const trigger=Object.hasOwn(ANIMATION_TRIGGERS,raw?.trigger)?raw.trigger:'click';
  const duration=number(raw?.duration,.5,.1,5);
  const order=Number.isInteger(raw?.order)&&raw.order>=1&&raw.order<=50?raw.order:undefined;
  return {effect,trigger,duration,...(order===undefined?{}:{order})};
}

export function orderedAnimations(objects){
  return objects.flatMap((object,index)=>{
    const animation=animationFor(object.animation);
    return animation.effect==='none'?[]:[{object,index,animation}];
  }).sort((left,right)=>(left.animation.order??Infinity)-(right.animation.order??Infinity)||left.index-right.index);
}

export function safeLink(value){
  try{
    const url=new URL(value);
    return ['http:','https:','mailto:'].includes(url.protocol)&&url.href.length<=2000?url.href:'';
  }catch{return '';}
}

export function object(type='text'){
  const base={type,x:80,y:160,w:200,h:160,rotation:0,opacity:100,fill:'#68bbef',stroke:'#245f9a',strokeWidth:2,link:''};
  if(type==='text')return {...base,w:800,h:140,text:'Твій текст',size:32,
    font:'Arial',bold:false,italic:false,underline:false,align:'left',valign:'top',bullets:'none',color:'#172033'};
  if(type==='image')return {...base,w:360,h:240,fit:'stretch',alt:'Зображення на слайді',src:''};
  if(type==='table')return {...base,w:800,h:250,fill:'#bfdbfe',stroke:'#7392af',size:24,font:'Arial',color:'#172033',bold:false,align:'left',head:true,
    cells:[['Стовпець 1','Стовпець 2'],['',''],['','']]};
  if(type==='line')return {...base,w:280,h:20,strokeWidth:4};
  return base;
}

export function slide(layout='title',theme='classic'){
  const palette=Object.hasOwn(SLIDE_THEMES,theme)?SLIDE_THEMES[theme]:SLIDE_THEMES.classic;
  const text=(label,options)=>({...object(),text:label,color:palette.text,...options});
  const heading=text('Заголовок слайда',{y:56,h:104,size:44,bold:true});
  const introduction=text('Додай свою ідею',{y:235});
  const twoColumn=()=>{
    const column=(label,x)=>text(label,{x,y:190,w:370,h:310,size:27,bullets:'bullet'});
    return [heading,column('Перший пункт',80),column('Другий пункт',510)];
  };
  const objects={
    blank:()=>[],
    heading:()=>[heading],
    title:()=>[heading,introduction],
    twoColumn,
    section:()=>[text('Назва розділу',{y:176,h:155,size:56,bold:true,valign:'middle',align:'center'}),
      {...object('rect'),x:352,y:342,w:256,h:20,fill:palette.accent,strokeWidth:0}],
    imageCaption:()=>[heading,text('Додай ілюстрацію та її підпис',{y:405,h:80,size:26,align:'center'})],
    comparison:()=>{
      const label=(title,x)=>text(title,{x,y:166,w:370,h:50,size:29,bold:true,color:palette.text});
      const column=(title,x)=>text(title,{x,y:230,w:370,h:250,size:25,bullets:'bullet'});
      return [heading,label('Варіант А',80),label('Варіант Б',510),column('Особливість',80),column('Особливість',510)];
    }
  };
  const create=Object.hasOwn(objects,layout)?objects[layout]:objects.title;
  return {background:palette.background,title:'',notes:'',transition:'none',advance:0,hidden:false,objects:create()};
}

export const blank=()=>({format:'informatyka-slides',version:1,name:'Моя презентація',aspect:'wide',theme:'classic',slides:[slide()]});

function tableCells(value,fallback){
  if(!Array.isArray(value)||!value.length||!value.every(Array.isArray))return fallback;
  const rows=value.slice(0,10),columns=Math.min(8,Math.max(1,...rows.map(row=>row.length)));
  return rows.map(row=>Array.from({length:columns},(_,index)=>string(row[index],200)));
}

function validateObject(raw){
  if(!TYPES.includes(raw?.type))throw Error('Непідтримуваний об’єкт на слайді.');
  const base=object(raw.type),x=number(raw.x,base.x,0,940),y=number(raw.y,base.y,0,520);
  const result={
    ...base,x,y,w:Math.min(960-x,number(raw.w,base.w,20,960)),h:Math.min(540-y,number(raw.h,base.h,20,540)),
    rotation:number(raw.rotation,0,-180,180),opacity:number(raw.opacity,100,0,100),link:safeLink(raw.link),
    fill:color(raw.fill,base.fill),stroke:color(raw.stroke,base.stroke),strokeWidth:number(raw.strokeWidth,base.strokeWidth,0,24),
    animation:animationFor(raw.animation)
  };
  if(raw.type==='text')Object.assign(result,{
    text:string(raw.text,5000),size:number(raw.size,base.size,10,120),font:fontName(raw.font),bold:raw.bold===true,
    italic:raw.italic===true,underline:raw.underline===true,align:pick(raw.align,['left','center','right','justify'],'left'),
    valign:pick(raw.valign,['top','middle','bottom'],'top'),bullets:pick(raw.bullets,['none','bullet','number'],'none'),color:color(raw.color,base.color)
  });
  if(raw.type==='image'){
    if(typeof raw.src!=='string'||!validImage.test(raw.src)||raw.src.length>3000000){
      throw Error('Зображення має бути PNG або JPEG до 2 МБ.');
    }
    Object.assign(result,{src:raw.src,fit:pick(raw.fit,['stretch','contain','cover'],'stretch'),alt:string(raw.alt,240)||base.alt});
  }
  if(raw.type==='table')Object.assign(result,{
    cells:tableCells(raw.cells,base.cells),head:raw.head!==false,size:number(raw.size,base.size,10,96),
    color:color(raw.color,base.color),font:fontName(raw.font),bold:raw.bold===true,align:pick(raw.align,['left','center','right','justify'],'left')
  });
  return result;
}

function validate(data){
  if(data?.format!=='informatyka-slides'||data.version!==1||!Array.isArray(data.slides)||!data.slides.length||data.slides.length>50){
    throw Error('Непідтримуваний проєкт презентації (1–50 слайдів).');
  }
  const result={
    ...blank(),name:cleanName(data.name),aspect:pick(data.aspect,Object.keys(SLIDE_ASPECTS),'wide'),
    theme:pick(data.theme,Object.keys(SLIDE_THEMES),'classic'),
    slides:data.slides.map(item=>{
      if(!Array.isArray(item?.objects)||item.objects.length>50)throw Error('На слайді може бути до 50 об’єктів.');
      return {background:color(item.background),title:string(item.title,120),notes:string(item.notes,8000),
        transition:pick(item.transition,['none','fade','push','wipe'],'none'),advance:number(item.advance,0,0,600),
        hidden:item.hidden===true,objects:item.objects.map(validateObject)};
    })
  };
  if(Array.isArray(data.importWarnings))result.importWarnings=data.importWarnings.filter(value=>typeof value==='string').slice(0,12).map(value=>value.slice(0,180));
  return result;
}

export async function read(file,name=file.name||'Презентація.slides.json'){
  if(file.size>MAX_PROJECT_BYTES)throw Error('Файл презентації має бути до 20 МБ.');
  if(/\.pptx$/i.test(name)){
    const {readPptx}=await import('./pptx-import.js');
    const result=validate(await readPptx(file,name,{object,safeLink}));
    if(new Blob([JSON.stringify(result)]).size>MAX_PROJECT_BYTES)throw Error('Імпортована презентація більша за 20 МБ. Зменш зображення або кількість слайдів.');
    return result;
  }
  if(!/\.json$/i.test(name))throw Error('Відкрий файл PPTX або проєкт .slides.json.');
  return validate(JSON.parse(await file.text()));
}

async function loadImage(src){
  const image=new Image();image.src=src;
  await image.decode();
  return image;
}

function imageCanvas(image,w,h,source){
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w));canvas.height=Math.max(1,Math.round(h));
  canvas.getContext('2d').drawImage(image,...source,0,0,canvas.width,canvas.height);
  return canvas;
}

export async function imageData(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){
    throw Error('Обери PNG, JPEG або WebP до 5 МБ.');
  }
  const url=URL.createObjectURL(file);
  try{
    const image=await loadImage(url),w=image.naturalWidth,h=image.naturalHeight;
    const scale=Math.min(1,1600/Math.max(w,h)),canvas=imageCanvas(image,w*scale,h*scale,[0,0,w,h]);
    let src=canvas.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.86);
    if(src.length>3000000&&file.type!=='image/png')src=canvas.toDataURL('image/jpeg',.77);
    if(src.length>3000000)throw Error('Зображення завелике після обробки. Обери менше.');
    return {src,ratio:canvas.width/canvas.height};
  }finally{URL.revokeObjectURL(url);}
}

async function imageForPptx(item,position){
  const options={...position,data:item.src,altText:item.alt,transparency:100-item.opacity};
  if(item.fit==='stretch')return options;
  const image=await loadImage(item.src),w=image.naturalWidth,h=image.naturalHeight,ratio=position.w/position.h;
  if(item.fit==='contain'){
    const width=Math.min(position.w,position.h*w/h),height=width*h/w;
    return {...options,x:position.x+(position.w-width)/2,y:position.y+(position.h-height)/2,w:width,h:height};
  }
  const width=Math.min(w,h*ratio),height=width/ratio;
  const canvas=imageCanvas(image,width,height,[(w-width)/2,(h-height)/2,width,height]);
  return {...options,data:canvas.toDataURL(item.src.startsWith('data:image/jpeg;')?'image/jpeg':'image/png',.86)};
}

function transitionMarkup(item){
  const effect={none:'',fade:'<p:fade/>',push:'<p:push dir="l"/>',wipe:'<p:wipe dir="l"/>'}[item.transition];
  if(!effect&&!item.advance)return '';
  const time=item.advance?' advTm="'+Math.round(item.advance*1000)+'"':'';
  return '<p:transition spd="med" advClick="1"'+time+'>'+effect+'</p:transition>';
}

const animationPresets={appear:[1,0],fade:[10,0],fly:[2,4],zoom:[23,0]};
const animationNodeTypes={click:'clickEffect',with:'withEffect',after:'afterEffect'};

function animationTiming(animations){
  let nextId=2;
  const groups=[];
  let group,previousStart=0,previousFinish=0;
  for(const {index,animation} of animations){
    const {effect,trigger}=animation,duration=effect==='appear'?1:Math.round(animation.duration*1000);
    if(!group||trigger==='click'){
      group={delay:trigger==='click'?'indefinite':0,items:[]};groups.push(group);
      previousStart=0;previousFinish=0;
    }
    const delay=trigger==='after'?previousFinish:previousStart;
    group.items.push({spid:index+2,effect,trigger,delay,duration});
    previousStart=delay;previousFinish=delay+(effect==='appear'?0:duration);
  }
  const condition=delay=>`<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`;
  const par=(attributes,body,delay)=>`<p:par><p:cTn id="${++nextId}" ${attributes}>${condition(delay)}<p:childTnLst>${body()}</p:childTnLst></p:cTn></p:par>`;
  function behavior(spid,duration,attribute='',options=''){
    const name=attribute?`<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst>`:'';
    return `<p:cBhvr${options}><p:cTn id="${++nextId}" dur="${duration}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>${name}</p:cBhvr>`;
  }
  function effectMarkup({spid,effect,duration}){
    const reveal=`<p:set>${behavior(spid,1,'style.visibility')}<p:to><p:strVal val="visible"/></p:to></p:set>`;
    if(effect==='appear')return reveal;
    if(effect==='fade')return reveal+`<p:animEffect transition="in" filter="fade">${behavior(spid,duration)}</p:animEffect>`;
    if(effect==='zoom')return reveal+`<p:animScale zoomContents="1">${behavior(spid,duration)}<p:from x="1000" y="1000"/><p:to x="100000" y="100000"/></p:animScale>`;
    const value=(time,formula)=>`<p:tav tm="${time}"><p:val><p:strVal val="${formula}"/></p:val></p:tav>`;
    return reveal+`<p:anim calcmode="lin" valueType="num">${behavior(spid,duration,'ppt_y',' additive="base"')}<p:tavLst>${value(0,'1+#ppt_h/2')}${value(100000,'#ppt_y')}</p:tavLst></p:anim>`;
  }
  const groupMarkup=groups.map(({delay,items})=>par('fill="hold"',()=>items.map(item=>
    par('fill="hold"',()=>{
      const [preset,subtype]=animationPresets[item.effect];
      return par(`presetID="${preset}" presetClass="entr" presetSubtype="${subtype}" dur="${item.duration}" fill="hold" nodeType="${animationNodeTypes[item.trigger]}"`,()=>effectMarkup(item),0);
    },item.delay)
  ).join(''),delay)).join('');
  const controls=['Prev','Next'].map(direction=>`<p:${direction.toLowerCase()}CondLst><p:cond evt="on${direction}" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:${direction.toLowerCase()}CondLst>`).join('');
  const textBuilds=animations.filter(({object})=>object.type==='text')
    .map(({index})=>`<p:bldP spid="${index+2}" grpId="0" animBg="1"/>`).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groupMarkup}</p:childTnLst></p:cTn>${controls}</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${textBuilds?`<p:bldLst>${textBuilds}</p:bldLst>`:''}</p:timing>`;
}

function applyAnimationTiming(body,objects){
  const animations=orderedAnimations(objects);
  if(!animations.length)return body;
  const tree=body.match(/<p:spTree>[\s\S]*?<\/p:spTree>/)?.[0];
  if(!tree||[...tree.matchAll(/<p:cNvPr id="\d+"/g)].length!==objects.length+1){
    throw Error('Не вдалося зіставити анімації з об’єктами для експорту PPTX.');
  }
  // IDs emitted for tables use a separate sequence from other objects.
  let id=0;
  const renumbered=tree.replace(/<p:cNvPr id="\d+"/g,()=>`<p:cNvPr id="${++id}"`);
  return body.replace(tree,()=>renumbered).replace('</p:sld>',()=>animationTiming(animations)+'</p:sld>');
}

function xmlText(value){
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')
    .replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}

async function preserveSlideMetadata(blob,slides){
  if(!slides.some(item=>item.title||item.advance||item.transition!=='none'||item.objects.some(object=>object.type==='table'||object.animation.effect!=='none')))return blob;
  // PptxGenJS handles slide content; add native slide metadata to the generated parts.
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  slides.forEach((item,index)=>{
    const path=`ppt/slides/slide${index+1}.xml`;
    let body=strFromU8(files[path]);
    if(item.title)body=body.replace(/<p:cSld(?: name="[^"]*")?(?=[ >])/,()=>'<p:cSld name="'+xmlText(item.title)+'"');
    body=body.replace('</p:clrMapOvr>',()=>'</p:clrMapOvr>'+transitionMarkup(item));
    const tables=item.objects.filter(object=>object.type==='table');
    let tableIndex=0;
    if(tables.length)body=body.replaceAll('<a:tblPr/>',()=>'<a:tblPr firstRow="'+(tables[tableIndex++]?.head?'1':'0')+'"/>');
    body=applyAnimationTiming(body,item.objects);
    files[path]=strToU8(body);
  });
  return new Blob([zipSync(files,{level:4})],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
}

export async function toPptx(input){
  const doc=validate(input),PptxGenJS=await library('pptxgen.bundle.js','pptxgen'),pptx=new PptxGenJS();
  const standard=doc.aspect==='standard',width=standard?10:40/3,height=7.5;
  if(standard){
    pptx.defineLayout({name:'STANDARD_4_3',width,height});pptx.layout='STANDARD_4_3';
  }else pptx.layout='LAYOUT_WIDE';
  pptx.author='Віртуальний кабінет інформатики';pptx.subject='Навчальна презентація';pptx.title=doc.name;pptx.lang='uk-UA';
  const pointScale=.75;
  const shapeNames={arrow:'rightArrow',star:'star5'};
  for(const item of doc.slides){
    const target=pptx.addSlide();
    target.background={color:item.background.slice(1)};
    target.hidden=item.hidden;
    if(item.notes)target.addNotes(item.notes);
    for(const entry of item.objects){
      const {type,x,y,w,h,rotation,link}=entry;
      const position={x:x*width/960,y:y*height/540,w:w*width/960,h:h*height/540,rotate:(rotation+360)%360};
      if(link)position.hyperlink={url:link};
      const transparency=100-entry.opacity;
      if(type==='text'){
        const options={
          ...position,fontFace:entry.font,fontSize:entry.size*pointScale,color:entry.color.slice(1),transparency,bold:entry.bold,
          italic:entry.italic,underline:entry.underline,align:entry.align,valign:entry.valign,margin:0
        };
        const lines=entry.text.split('\n');
        const contents=entry.bullets==='none'?entry.text:lines.map((text,index)=>({
          text,options:{...options,breakLine:index<lines.length-1,
            bullet:{indent:entry.size*.6,...(entry.bullets==='number'?{type:'number',numberStartAt:index+1}:{})}}
        }));
        target.addText(contents,options);
      }else if(type==='image')target.addImage(await imageForPptx(entry,position));
      else if(type==='table'){
        const cells=entry.cells.map((row,index)=>row.map(text=>({
          text,options:{transparency,bold:entry.bold||index===0&&entry.head,
            fill:{color:index===0&&entry.head?entry.fill.slice(1):'FFFFFF',transparency}}
        })));
        target.addTable(cells,{
          ...position,h:undefined,autoPage:false,rowH:position.h/cells.length,fontFace:entry.font,fontSize:entry.size*pointScale,
          align:entry.align,valign:'middle',color:entry.color.slice(1),margin:3,border:{color:entry.stroke.slice(1),type:entry.strokeWidth?'solid':'none',pt:entry.strokeWidth*pointScale}
        });
      }else{
        const line={color:entry.stroke.slice(1),width:entry.strokeWidth*pointScale,transparency:entry.strokeWidth?transparency:100};
        const fill=type==='line'?undefined:{color:entry.fill.slice(1),transparency};
        target.addShape(pptx.ShapeType[shapeNames[type]||type],{...position,fill,line});
      }
    }
  }
  const blob=await pptx.write({outputType:'blob'});
  return preserveSlideMetadata(blob,doc.slides);
}
