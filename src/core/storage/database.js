let connection;
export function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve,reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Цей браузер не підтримує локальне сховище.')); return; }
    const request = indexedDB.open('offline-informatyka',1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const files = db.createObjectStore('files',{keyPath:'id'});
      files.createIndex('updatedAt','updatedAt');
      files.createIndex('moduleId','moduleId');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закрийте інші вкладки платформи та оновіть сторінку.'));
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}
export async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('files',mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Помилка сховища.'));
    tx.onabort = () => reject(tx.error || new Error('Збереження перервано.'));
    try {
      const request = operation(tx.objectStore('files'));
      request.onsuccess = () => { result = request.result; };
    } catch(error) { tx.abort(); reject(error); }
  });
}

export function storageError(error) {
  if (error?.name === 'QuotaExceededError') return 'На пристрої бракує місця. Завантаж важливі роботи й звільни місце.';
  if (['SecurityError','InvalidStateError','UnknownError'].includes(error?.name)) return 'Браузер не дає доступу до сховища. Перевір дозволи сайту та чи не ввімкнено приватний режим.';
  return error?.message || 'Не вдалося записати дані. Спробуй ще раз.';
}
