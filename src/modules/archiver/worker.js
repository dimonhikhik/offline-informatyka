import { zipSync,unzipSync } from '../../vendor/fflate/browser.js';
import { MAX_BYTES,MAX_ENTRIES,validateEntries,validPath } from './limits.js';
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^-1)>>>0;
}
function readZip(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('ZIP має бути не більшим за 25 МБ.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end = bytes.length-22;
  while (end>=Math.max(0,bytes.length-65557) && (view.getUint32(end,true)!==0x06054b50 || end+22+view.getUint16(end+20,true)!==bytes.length)) end--;
  if (end<Math.max(0,bytes.length-65557)) throw new Error('Не вдалося знайти структуру ZIP.');
  const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), size=view.getUint32(end+12,true);
  if (view.getUint16(end+4,true) || view.getUint16(end+6,true) || view.getUint16(end+8,true)!==count || count===65535 || start===0xffffffff) throw new Error('Багатотомні ZIP та ZIP64 поки не підтримуються.');
  if (count>MAX_ENTRIES || start+size>end) throw new Error('Архів завеликий або пошкоджений.');
  const expected=new Map(); let offset=start,total=0;
  for(let i=0;i<count;i++) {
    if(offset+46>end || view.getUint32(offset,true)!==0x02014b50) throw new Error('Пошкоджений каталог ZIP.');
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),rawSize=view.getUint32(offset+24,true);
    const n=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
    if (flags&1 || ![0,8].includes(method)) throw new Error('Підтримуються ZIP без пароля зі звичайним стисненням Deflate або без стиснення.');
    if(offset+46+n+extra+comment>start+size) throw new Error('Пошкоджений запис ZIP.');
    const nameBytes=bytes.subarray(offset+46,offset+46+n);
    if (!(flags&2048) && nameBytes.some(value=>value>127)) throw new Error('Назви в цьому ZIP мають старе кодування. Перезбережи архів із назвами UTF-8.');
    const path=validPath(new TextDecoder('utf-8',{fatal:true}).decode(nameBytes));
    if(expected.has(path)) throw new Error('ZIP містить однакові шляхи.');
    total+=rawSize;
    if(total>MAX_BYTES) throw new Error('Після розпакування архів перевищить 25 МБ.');
    expected.set(path,{size:rawSize,crc:view.getUint32(offset+16,true)});
    offset+=46+n+extra+comment;
  }
  const result=unzipSync(bytes); const entries=[];
  for(const [path,info] of expected) {
    const data=result[path];
    if(!data || data.length!==info.size || crc32(data)!==info.crc) throw new Error(`Файл пошкоджений: ${path}`);
    entries.push({path,data});
  }
  validateEntries(entries); return entries;
}
self.onmessage=({data})=>{
  try {
    if(data.action==='open') self.postMessage({result:readZip(new Uint8Array(data.bytes))});
    else {
      validateEntries(data.entries);
      const files=Object.create(null);
      for(const entry of data.entries) files[entry.path]=entry.data;
      const result=zipSync(files,{level:data.level});
      if(result.length>MAX_BYTES) throw new Error('Готовий ZIP перевищує 25 МБ. Прибери кілька файлів.');
      self.postMessage({result},[result.buffer]);
    }
  } catch(error) { self.postMessage({error:error.message || 'Не вдалося обробити ZIP.'}); }
};
self.postMessage({ready:true});
