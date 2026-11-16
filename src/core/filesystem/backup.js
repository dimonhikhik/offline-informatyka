import { listFiles } from './index.js';
import { transaction } from '../storage/database.js';
const LIMIT = 50 * 1024 * 1024;
function encode(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл для копії.'));
    reader.readAsDataURL(blob);
  });
}
export async function createBackup() {
  const files = await listFiles();
  if (files.reduce((sum,file)=>sum+file.blob.size,0) > LIMIT) throw new Error('Копія підтримує до 50 МБ даних. Великі файли завантаж окремо.');
  const records = [];
  for (const file of files) records.push({name:file.name,moduleId:file.moduleId,type:file.blob.type,createdAt:file.createdAt,data:await encode(file.blob)});
  return new Blob([JSON.stringify({format:'informatyka-offline-backup',version:1,files:records})],{type:'application/json'});
}
export async function restoreBackup(blob) {
  if (blob.size > 75 * 1024 * 1024) throw new Error('Пакунок завеликий. Максимальний розмір — 75 МБ.');
  let data;
  try { data = JSON.parse(await blob.text()); } catch { throw new Error('Це не вдалося прочитати як резервну копію.'); }
  if (data?.format !== 'informatyka-offline-backup' || data.version !== 1 || !Array.isArray(data.files) || data.files.length > 10000) throw new Error('Непідтримуваний формат резервної копії.');
  let total = 0;
  const records = data.files.map(item=>{
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length>180 || /[\\/\x00-\x1f]/.test(item.name) || typeof item.data !== 'string' || typeof item.type !== 'string') throw new Error('Пакунок містить пошкоджений запис. Нічого не відновлено.');
    let bytes;
    try { const raw = atob(item.data); bytes = Uint8Array.from(raw,c=>c.charCodeAt(0)); } catch { throw new Error('Пошкоджені дані файлу в копії.'); }
    total += bytes.length;
    if (total > LIMIT) throw new Error('У копії понад 50 МБ даних.');
    const fileBlob = new Blob([bytes],{type:item.type});
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    return {id,name:item.name.trim(),blob:fileBlob,moduleId:item.moduleId === 'notes' ? 'notes' : 'import',createdAt:Number.isFinite(item.createdAt)?item.createdAt:Date.now(),updatedAt:Date.now(),size:fileBlob.size,type:fileBlob.type,schemaVersion:1};
  });
  // All inserts share one transaction: a failure rolls back the entire import.
  if (records.length) await transaction('readwrite',store=>{
    let request;
    for (const record of records) request = store.add(record);
    return request;
  });
  return records.length;
}
