import { transaction } from '../storage/database.js';
export const listFiles = async () => (await transaction('readonly',store => store.getAll())).sort((a,b) => b.updatedAt-a.updatedAt);
export const getFile = id => transaction('readonly',store => store.get(id));
export const deleteFile = id => transaction('readwrite',store => store.delete(id));
export const importFile = file => saveFile({name:file.name,blob:file,moduleId:/\.txt$/i.test(file.name)?'notes':'import'});
export async function exportFile(id) {
  const file = await getFile(id);
  if (!file) throw new Error('Файл уже видалено.');
  return {name:file.name,blob:file.blob};
}
export async function saveFile({id,name,blob,moduleId='import',createdAt=Date.now()}) {
  if (!(blob instanceof Blob)) throw new Error('Файл має містити дані.');
  name = String(name).trim();
  if (!name || name.length > 180 || /[\\/\x00-\x1f]/.test(name)) throw new Error('Назва: 1–180 символів, без слешів і керівних символів.');
  if (!id) { const bytes = crypto.getRandomValues(new Uint8Array(16)); id = Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''); }
  const record = {id,name,blob,moduleId,createdAt,updatedAt:Date.now(),size:blob.size,type:blob.type,schemaVersion:1};
  await transaction('readwrite',store => store.put(record));
  return record;
}
export async function renameFile(id,name) {
  const file = await getFile(id);
  if (!file) throw new Error('Файл уже видалено.');
  return saveFile({...file,name});
}
