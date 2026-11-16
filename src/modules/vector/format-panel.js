import { el } from '../../components/ui.js';
import { clone,FONT_FAMILIES,paintMode } from './model.js';

const button = (text, onClick, attrs={}) => el('button',{type:'button',onClick,...attrs},text);
const options = values => Object.entries(values).map(([value,label])=>el('option',{value},label));
const label = (text,input) => el('label',{},text,input);
const grid = (...children) => el('div',{className:'vector-fields'},...children);
const color = value => /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
const presets = {
  sunset: ['#5b246b','#ef647a','#f7cd6a'],
  blue: ['#143567','#3d9fe8','#d0f5ff'],
  gray: ['#202333','#ffffff']
};
const paintChoices={none:'Без кольору',solid:'Суцільний',linear:'Лінійний градієнт',radial:'Радіальний градієнт'};
const meshes={diagonal:'Діагоналі',grid:'Сітка',dots:'Крапки',checker:'Шахівниця'};

function stopsFor(object,kind) {
  return clone(object[kind+'Stops']??[{offset:0,color:color(object[kind])},{offset:1,color:color(object[kind+'2'])}])
    .sort((a,b)=>a.offset-b.offset);
}

export function formatPanel({selected,defaults,change,editDirection}) {
  const pane=el('div',{className:'vector-format'});
  const fields=[];
  const current=()=>selected()[0]??defaults;
  function apply(action) {
    change(()=>{
      const items=selected();
      for(const object of items.length?items:[defaults])action(object);
    });
  }
  function field(text,key,type,attrs) {
    const input=el('input',{type,...attrs,onChange:()=>{
      const value=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;
      if(type==='number'&&(!input.value||!input.validity.valid))return sync();
      apply(object=>{object[key]=value;});
    }});
    fields.push(()=>{const value=current()[key]??defaults[key];if(type==='checkbox')input.checked=!!value;else input.value=type==='color'?color(value):value;});
    return label(text,input);
  }
  function choice(text,key,choices) {
    const input=el('select',{onChange:()=>apply(object=>{object[key]=input.value;})},...options(choices));
    fields.push(()=>{input.value=current()[key]??defaults[key];});
    return label(text,input);
  }
  function paint(kind,title) {
    const mode=el('select',{onChange:()=>apply(o=>{
      o[kind+'Mode']=mode.value==='none'?'solid':mode.value;
      if(mode.value==='none')o[kind]='none';
      else if(o[kind]==='none')o[kind]=kind==='fill'?'#b69aef':'#28354b';
    })},...options(kind==='fill'?{...paintChoices,pattern:'Візерунок',mesh:'Сітковий градієнт'}:paintChoices));
    const primary=el('input',{type:'color',onChange:()=>apply(o=>{o[kind]=primary.value;})});
    const secondary=el('input',{type:'color',onChange:()=>apply(o=>{o[kind+'2']=secondary.value;})});
    const secondLabel=label('Другий колір',secondary);
    const colors=grid(label('Тип',mode),label('Колір',primary),secondLabel);
    const pattern=kind==='fill'?choice('Візерунок','fillPattern',meshes):null;
    const mesh=el('div',{className:'vector-fields'});
    if(kind==='fill'){
      for(const [i,text] of ['Верх ліворуч','Верх праворуч','Низ ліворуч','Низ праворуч'].entries()){
        const input=el('input',{type:'color',onChange:()=>apply(o=>{
          o.meshColors??=[color(o.fill),color(o.fill2),color(o.fill2),color(o.fill)];
          o.meshColors[i]=input.value;
        })});
        fields.push(()=>{const o=current();input.value=o.meshColors?.[i]??color(i===0||i===3?o.fill:o.fill2);});
        mesh.append(label(text,input));
      }
    }
    const stops=el('div',{className:'vector-gradient-stops'});
    const spread=choice('Повтор',kind+'Spread',{pad:'Без повторення',reflect:'Відбиття',repeat:'Повторення'});
    const preset=el('select',{onChange:()=>{
      const colors=presets[preset.value];
      if(colors)apply(o=>{o[kind+'Stops']=colors.map((color,index)=>({color,offset:index/(colors.length-1)}));});
      preset.value='';
    }},...options({'':'Обрати…',sunset:'Помаранчевий',blue:'Блакитний',gray:'Чорно-білий'}));
    const addStop=button('+ Точка',()=>apply(o=>{
      const list=stopsFor(o,kind);
      if(list.length>=24)return;
      let index=0;
      for(let i=1;i<list.length-1;i++)if(list[i+1].offset-list[i].offset>list[index+1].offset-list[index].offset)index=i;
      const left=list[index],right=list[index+1];
      list.push({offset:(left.offset+right.offset)/2,color:right.color});
      o[kind+'Stops']=list;
    }));
    const edit=button('↗ Напрямок',()=>editDirection(kind));
    const gradient=el('div',{},grid(label('Шаблон',preset),spread),stops,el('div',{className:'vector-small-actions'},addStop,edit));
    fields.push(()=>{
      const o=current(),active=o[kind]==='none'?'none':paintMode(o,kind);
      mode.value=active;
      primary.value=color(o[kind]);
      primary.disabled=active==='none'||active==='mesh'||active==='linear'||active==='radial';
      secondary.value=color(o[kind+'2']);
      secondLabel.hidden=active!=='pattern';
      if(pattern)pattern.hidden=active!=='pattern';
      mesh.hidden=active!=='mesh';
      gradient.hidden=active!=='linear'&&active!=='radial';
      if(gradient.hidden)return;
      edit.disabled=selected().length!==1;
      const list=stopsFor(o,kind);
      addStop.disabled=list.length>=24;
      stops.replaceChildren(...list.map((point,i)=>{
        const position=el('input',{type:'number',min:0,max:100,step:1,value:Math.round(point.offset*100),'aria-label':'Позиція точки '+(i+1)+' у відсотках',onChange:()=>{
          if(position.value===''||!position.validity.valid)return sync();
          update(p=>{p.offset=Number(position.value)/100;});
        }});
        const swatch=el('input',{type:'color',value:point.color,'aria-label':'Колір точки '+(i+1),onChange:()=>update(p=>{p.color=swatch.value;})});
        function update(action){apply(o=>{const list=stopsFor(o,kind);if(list[i]){action(list[i]);o[kind+'Stops']=list;}});}
        return el('div',{className:'vector-stop'},swatch,position,el('span',{},'%'),
          button('×',()=>apply(o=>{const list=stopsFor(o,kind);if(list.length>2&&list[i]){list.splice(i,1);o[kind+'Stops']=list;}}),
            {disabled:list.length<=2,'aria-label':'Видалити точку '+(i+1)}));
      }));
    });
    return el('details',{open:kind==='fill'},el('summary',{},title),colors,pattern,mesh,gradient,
      kind==='stroke'?grid(
        field('Товщина','strokeWidth','number',{min:0,max:50,step:.5}),
        choice('Лінія','strokeDash',{solid:'Суцільна',dash:'Штрихи',dot:'Крапки','dash-dot':'Штрих і крапка'}),
        choice('Кінці','strokeCap',{butt:'Плоскі',round:'Круглі',square:'Квадратні'}),
        choice('З’єднання','strokeJoin',{miter:'Гостре',round:'Кругле',bevel:'Скошене'})
      ):null);
  }
  pane.append(paint('fill','Заливка'),paint('stroke','Контур'),
    el('details',{},el('summary',{},'Ефекти'),grid(field('Непрозорість (0–1)','opacity','number',{min:0,max:1,step:.05}),
      field('Тінь','shadow','checkbox'),field('Колір тіні','shadowColor','color'),field('Фаска й рельєф','bevel','checkbox'))));
  function sync(){for(const update of fields)update();}
  return {pane,sync};
}

function formatRanges(runs,oldText,text){
  let first=0,oldEnd=oldText.length,newEnd=text.length;
  while(first<oldEnd&&first<newEnd&&oldText[first]===text[first])first++;
  while(oldEnd>first&&newEnd>first&&oldText[oldEnd-1]===text[newEnd-1]){oldEnd--;newEnd--;}
  const delta=newEnd-oldEnd;
  return runs.map(run=>({...run,
    start:run.start>=oldEnd?run.start+delta:Math.min(run.start,first),
    end:run.end<=first?run.end:run.end>=oldEnd?run.end+delta:first
  })).filter(run=>run.start<run.end);
}

export function editVectorText(host,object,update){
  let runs=clone(object.textRuns??[]), previous=object.text, range=[0,0];
  const text=el('textarea',{maxlength:4000,rows:4,'aria-label':'Текст напису'},object.text);
  function remember(){range=[text.selectionStart,text.selectionEnd];}
  for(const event of ['select','keyup','pointerup','focus'])text.addEventListener(event,remember);
  text.addEventListener('input',()=>{
    runs=formatRanges(runs,previous,text.value);
    previous=text.value;remember();
  });
  const font=el('select',{},...options(FONT_FAMILIES));font.value=object.fontFamily??'Arial';
  const size=el('input',{type:'number',min:1,max:960,step:1,value:Math.round(object.fontSize??Math.min(object.h,960)),required:true});
  const align=el('select',{},...options({start:'Ліворуч',middle:'По центру',end:'Праворуч'}));align.value=object.textAlign??'start';
  const spacing=el('input',{type:'number',min:-30,max:200,step:.1,value:object.letterSpacing??0,required:true});
  const weight=el('input',{type:'checkbox',checked:object.fontWeight==='bold'});
  const italic=el('input',{type:'checkbox',checked:object.fontStyle==='italic'});
  const decoration=el('select',{},...options({none:'Звичайний',underline:'Підкреслений','line-through':'Закреслений'}));
  decoration.value=object.textDecoration??'none';
  const fragmentColor=el('input',{type:'color',value:color(object.fill)});
  const fragmentSize=el('input',{type:'number',min:1,max:960,value:size.value});
  const fragmentStatus=el('p',{role:'status',className:'vector-fragment-status'});
  const form=el('form',{onSubmit:event=>{
    event.preventDefault();
    dialog.close();
    update({text:text.value,textRuns:runs,fontFamily:font.value,fontSize:Number(size.value),fontWeight:weight.checked?'bold':'normal',
      fontStyle:italic.checked?'italic':'normal',textDecoration:decoration.value,textAlign:align.value,letterSpacing:Number(spacing.value)});
  }},
  el('h2',{},'Напис'),text,
  grid(label('Шрифт',font),label('Розмір',size),label('Вирівнювання',align),label('Інтервал',spacing),
    label('Накреслення',decoration),label('Жирний',weight),label('Курсив',italic)),
  el('details',{},el('summary',{},'Виділений фрагмент'),grid(label('Колір',fragmentColor),label('Розмір',fragmentSize)),
    el('div',{className:'vector-small-actions'},button('Застосувати',()=>{
      const [start,end]=range;
      if(start===end){fragmentStatus.textContent='Виділи частину тексту.';return;}
      if(!fragmentSize.value||!fragmentSize.validity.valid){fragmentSize.reportValidity();return;}
      if(runs.length>=250){fragmentStatus.textContent='Досягнуто межі форматування фрагментів.';return;}
      runs.push({start,end,fill:fragmentColor.value,fontSize:Number(fragmentSize.value)});
      fragmentStatus.textContent='Оформлення застосовано.';
    }),button('Очистити оформлення',()=>{runs=[];fragmentStatus.textContent='Оформлення фрагментів очищено.';})),
    fragmentStatus),
  el('div',{className:'vector-small-actions'},button('Скасувати',()=>dialog.close()),el('button',{type:'submit',className:'primary'},'Готово')));
  const dialog=el('dialog',{className:'vector-text-dialog'},form);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  host.append(dialog);dialog.showModal();text.focus();text.select();
  return dialog;
}
