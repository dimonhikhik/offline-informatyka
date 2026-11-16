export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_ENTRIES = 500;
export function validPath(path) {
  if (typeof path !== 'string' || !path || path.length > 500 || /[\\\x00-\x1f:]/.test(path) || path.startsWith('/')) throw new Error('Неприпустимий шлях у ZIP.');
  const parts = path.replace(/\/$/,'').split('/');
  if (parts.some(part=>!part.trim() || part==='.' || part==='..' || part.length>180 || ['__proto__','constructor','prototype'].includes(part))) throw new Error('Неприпустима назва файлу або папки.');
  return path;
}
export function validateEntries(entries) {
  if (entries.length > MAX_ENTRIES) throw new Error('Максимум 500 файлів і папок в одному архіві.');
  const paths = new Set(); let total = 0;
  for (const entry of entries) {
    validPath(entry.path);
    const key = entry.path.replace(/\/$/,'');
    if (paths.has(key)) throw new Error(`Назва повторюється: ${entry.path}`);
    paths.add(key); total += entry.data.byteLength;
  }
  for (const entry of entries) {
    const parts = entry.path.replace(/\/$/,'').split('/'); parts.pop();
    while (parts.length) {
      if (entries.some(other=>other.path===parts.join('/'))) throw new Error('Файл не може одночасно бути папкою.');
      parts.pop();
    }
  }
  if (total > MAX_BYTES) throw new Error('Загальний розмір файлів має бути не більшим за 25 МБ.');
}
