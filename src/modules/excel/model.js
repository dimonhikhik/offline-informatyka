import { library,cleanName,color,clamp } from '../office/shared.js';
import { address,position,calculator } from './formula.js';
export const newSheet=(name='Аркуш 1')=>({name,rows:50,cols:26,cells:{}});
export const blank=()=>({format:'informatyka-sheets',version:1,name:'Моя таблиця',sheets:[newSheet()]});
export function validate(data){
  if(data?.format!=='informatyka-sheets'||data.version!==1||!Array.isArray(data.sheets)||!data.sheets.length||data.sheets.length>10)throw Error('Це не проєкт таблиць цієї версії.');
  return {format:data.format,version:1,name:cleanName(data.name),sheets:data.sheets.map((s,i)=>{const out={name:String(s.name||`Аркуш ${i+1}`).replace(/[\\/*?:\[\]]/g,' ').slice(0,31),rows:clamp(Math.floor(s.rows),1,200),cols:clamp(Math.floor(s.cols),1,52),cells:{}};if(!s.cells||Object.keys(s.cells).length>10400)throw Error('Завеликий аркуш');for(const [key,v] of Object.entries(s.cells)){const [r,c]=position(key);if(r>=out.rows||c>=out.cols)throw Error('Комірки за межами аркуша');out.cells[address(r,c)]={value:String(v.value??'').slice(0,2000),bold:!!v.bold,italic:!!v.italic,fill:color(v.fill),color:color(v.color,'#172033'),align:['left','center','right'].includes(v.align)?v.align:'left',format:['general','number','percent'].includes(v.format)?v.format:'general'};}return out;})};
}
export async function read(file,name=file.name||'Таблиця'){
  if(file.size>8*1024*1024)throw Error('Файл має бути до 8 МБ.');
  if(/\.json$/i.test(name))return validate(JSON.parse(await file.text()));
  if(!/\.(xlsx|csv)$/i.test(name))throw Error('Відкрий XLSX, CSV або проєкт .sheets.json.');
  const XLSX=await library('xlsx.full.min.js','XLSX');
  const book=/\.csv$/i.test(name)?XLSX.read(await file.text(),{type:'string',raw:true}):XLSX.read(await file.arrayBuffer(),{type:'array'});
  if(!book.SheetNames.length||book.SheetNames.length>10)throw Error('Підтримується від 1 до 10 аркушів.');
  const doc=blank();doc.name=cleanName(name.replace(/\.[^.]+$/,''));doc.sheets=book.SheetNames.map(name=>{const ws=book.Sheets[name],range=XLSX.utils.decode_range(ws['!ref']||'A1');if(range.e.r>=200||range.e.c>=52)throw Error('Ліміт імпорту: 200 рядків та 52 стовпці на аркуш.');const s=newSheet(name);s.rows=Math.max(50,range.e.r+1);s.cols=Math.max(26,range.e.c+1);for(const [key,cell] of Object.entries(ws)){if(key[0]==='!')continue;s.cells[key]={value:cell.f?'='+cell.f:String(cell.v??'')};}return s;});return validate(doc);
}
export async function toXlsx(doc){
  const XLSX=await library('xlsx.full.min.js','XLSX'),book=XLSX.utils.book_new();
  for(const sheet of doc.sheets){
    const ws={},calc=calculator(sheet);
    for(const [key,cell] of Object.entries(sheet.cells)){
      if(!cell.value)continue;
      const v=calc(key);ws[key]={t:typeof v==='number'?'n':typeof v==='boolean'?'b':'s',v};
      if(cell.value.startsWith('='))ws[key].f=cell.value.slice(1).replace(/"(?:[^"]|"")*"|;/g,t=>t===';'?',':t);
      if(cell.format==='number')ws[key].z='0.00';
      if(cell.format==='percent')ws[key].z='0.00%';
    }
    ws['!ref']=`A1:${address(sheet.rows-1,sheet.cols-1)}`;
    XLSX.utils.book_append_sheet(book,ws,sheet.name);
  }
  return new Blob([XLSX.write(book,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function toCsv(sheet){const calc=calculator(sheet),keys=Object.keys(sheet.cells).filter(k=>sheet.cells[k].value),positions=keys.map(position),rows=Math.max(1,...positions.map(p=>p[0]+1)),cols=Math.max(1,...positions.map(p=>p[1]+1));return new Blob(['\ufeff'+Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>'"'+String(calc(address(r,c))).replaceAll('"','""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});}
