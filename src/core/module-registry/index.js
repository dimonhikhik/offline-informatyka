export const categories = ['Усі програми', 'Операційна система', 'Офісні програми', 'Програмування', 'Графіка та дизайн', 'Мультимедіа', 'Інтернет і хмарні сервіси'];
const records = [
  ['settings','Налаштування','Системні параметри віртуального кабінету.',1,'⚙','#79aaff',[]],
  ['windows','Windows','Віртуальний робочий стіл, вікна та робота з папками.',1,'▦','#79aaff',[]],
  ['archiver','Архіватор','Збирай файли в ZIP та досліджуй стиснення даних.',1,'▥','#f2c46d',['ZIP']],
  ['word','Word','Від першого абзацу до красиво оформленого документа.',2,'W','#79aaff',['DOCX','PDF','TXT']],
  ['excel','Excel','Досліджуй дані, обчислюй формули та будуй діаграми.',2,'X','#6dd7a2',['XLSX','CSV']],
  ['powerpoint','PowerPoint','Перетворюй свої ідеї на виразні презентації.',2,'P','#f49c7b',['PPTX']],
  ['access','Access','Створюй таблиці, зв’язки та запити до баз даних.',2,'A','#ee879c',['SQLite']],
  ['scratch','Scratch','Програмуй блоками, оживляй персонажів та ігри.',3,'S','#f2bc70',['SB3']],
  ['python','Python','Код, бібліотеки, запуск програм і вікна Tkinter.',3,'Py','#86bde8',['PY','PYTHON.JSON']],
  ['vector','Векторний редактор','Малюй фігури, працюй із кольорами та контурами.',4,'◇','#b69aef',['SVG','PNG']],
  ['raster','Растровий редактор','Малювання пензлем, виділення та шари.',4,'▦','#ec9caa',['PNG','JPEG','GIF','BMP','TIFF']],
  ['animation','Редактор анімацій','Кадр за кадром перетворюй малюнки на історії.',5,'▷','#ed96c7',['GIF']],
  ['audio','Аудіоредактор','Досліджуй звук, монтуй записи й експериментуй.',5,'≋','#81d7d6',['WAV']],
  ['three-d','3D-редактор','Створюй об’ємні об’єкти та власні маленькі світи.',4,'⬡','#b7abff',['GLB','GLTF']],
  ['browser','Віртуальний браузер','Вивчай вкладки, закладки та безпечну навігацію.',6,'◎','#7cc9f0',[]],
  ['cloud','Хмарне сховище','Навчальна локальна симуляція роботи з файлами у хмарі.',6,'☁','#95b6f7',[]],
];
/** Entry is a dynamic import function once a real editor is implemented. */
export const modules = records.map(([id,name,description,category,icon,color,formats]) => ({
  id,name,description,category:categories[category],icon,color,plannedFormats:formats,
  status:'В розробці',entry:null,supportedFormats:[],dependencies:[],offlineResources:[],
}));
Object.assign(modules.find(m=>m.id==='excel'),{status:'Частково доступно',entry:()=>import('../../modules/excel/index.js'),supportedFormats:['XLSX','CSV','SHEETS.JSON'],dependencies:['SheetJS CE 0.20.3 (Apache-2.0)'],offlineResources:['src/modules/office/shared.js','src/styles/office.css','src/modules/excel/index.js','src/modules/excel/model.js','src/modules/excel/formula.js','src/vendor/xlsx.full.min.js']});
Object.assign(modules.find(m=>m.id==='windows'),{name:'Операційна система',status:'Частково доступно',entry:()=>import('../../modules/windows/index.js'),supportedFormats:['Файли та папки','ZIP'],dependencies:['fflate 0.8.2 (MIT)'],offlineResources:['src/modules/windows/index.js','src/modules/windows/filesystem.js','src/modules/windows/window-manager.js','src/components/context-menu.js','src/styles/windows.css','src/modules/archiver/index.js','src/modules/archiver/zip-service.js','src/modules/archiver/worker.js','src/modules/archiver/limits.js','src/vendor/fflate/browser.js']});
Object.assign(modules.find(m=>m.id==='powerpoint'),{status:'Частково доступно',entry:()=>import('../../modules/powerpoint/index.js'),supportedFormats:['PPTX','SLIDES.JSON'],dependencies:['PptxGenJS 4.0.1 (MIT)','fflate 0.8.2 (MIT)'],offlineResources:['src/modules/office/shared.js','src/styles/office.css','src/styles/powerpoint.css','src/modules/powerpoint/index.js','src/modules/powerpoint/model.js','src/modules/powerpoint/canvas.js','src/modules/powerpoint/show.js','src/modules/powerpoint/film-reorder.js','src/modules/powerpoint/print.js','src/modules/powerpoint/pptx-import.js','src/vendor/pptxgen.bundle.js','src/vendor/fflate/browser.js']});
Object.assign(modules.find(module=>module.id==='archiver'),{
  status:'Частково доступно',entry:()=>import('../../modules/archiver/index.js'),supportedFormats:['ZIP'],
  dependencies:['fflate 0.8.2 (MIT)'],
  offlineResources:['src/modules/archiver/index.js','src/modules/archiver/worker.js','src/modules/archiver/zip-service.js','src/modules/archiver/limits.js','src/vendor/fflate/browser.js','src/components/context-menu.js','src/styles/windows.css'],
});
Object.assign(modules.find(module=>module.id==='vector'),{
  status:'Доступно',entry:()=>import('../../modules/vector/index.js'),supportedFormats:['SVG','PNG'],
  offlineResources:['src/modules/vector/index.js','src/modules/vector/model.js','src/modules/vector/svg.js','src/modules/vector/svg-import.js','src/modules/vector/canvas.js','src/modules/vector/nodes.js','src/modules/vector/composition.js','src/modules/vector/format-panel.js','src/styles/vector.css'],
});
Object.assign(modules.find(module=>module.id==='raster'),{
  status:'Доступно',entry:()=>import('../../modules/raster/index.js'),supportedFormats:['PNG','JPEG','GIF','BMP','TIFF','RASTER.JSON'],
  offlineResources:['src/modules/raster/index.js','src/modules/raster/pixels.js','src/modules/raster/formats.js','src/styles/raster.css'],
});
Object.assign(modules.find(module=>module.id==='python'),{
  status:'Доступно',entry:()=>import('../../modules/python/index.js'),supportedFormats:['PY','PYTHON.JSON'],
  dependencies:['Pyodide 0.29.2 (MPL-2.0)'],
  offlineResources:['src/modules/python/index.js','src/modules/python/worker.js','src/modules/python/runner.js','src/modules/python/libraries.js','src/modules/python/project.js','src/modules/python/guide.js','src/modules/python/tkinter.py','src/modules/python/tk-view.js','src/styles/python.css','src/styles/python-tk.css','src/vendor/pyodide/'],
});
Object.assign(modules.find(module=>module.id==='word'),{
  status:'Частково доступно',entry:()=>import('../../modules/word/index.js'),supportedFormats:['DOCX','TXT','WORD.JSON'],
  dependencies:['fflate 0.8.2 (MIT)'],
  offlineResources:['src/practice/grade45-detective.js','src/practice/catalog.js','src/practice/grade6-table.js','public/practice/grade6-table-3-2.pdf','public/practice/grade6-table-3-2-page1.png','public/practice/grade6-table-3-2-page2.png','src/modules/word/mobile-editing.js','src/modules/word/text-format.js','public/practice/grade9-text-2.docx','public/practice/grade9-text-3.docx','src/practice/grade9-text-3.js','src/modules/word/practice-tools.js','src/modules/word/review.js','src/modules/word/practice-exchange.js','src/pages/practice.js','src/practice/grade9-text.js','src/practice/guide.js','src/modules/word/columns.js','src/modules/word/selection.js','src/modules/word/formatting.js','src/modules/word/pages.js','src/modules/word/math.js','src/modules/word/structure.js','src/modules/word/tables.js','src/modules/word/chrome.js','src/modules/word/styles.js','src/styles/word.css','src/modules/word/index.js','src/modules/word/model.js','src/modules/word/docx-export.js','src/modules/word/docx-import.js','src/modules/word/print.js','src/vendor/fflate/browser.js'],
});

Object.assign(modules.find(module=>module.id==='browser'),{
  status:'Доступно',entry:()=>import('../../modules/browser/index.js'),supportedFormats:['BROWSER.JSON','TXT'],
  offlineResources:['src/modules/browser/index.js','src/modules/browser/model.js','src/modules/browser/sites.js','src/styles/browser.css','src/practice/grade45-detective.js','src/practice/catalog.js','src/practice/guide.js','src/practice/grade9-text.js','src/practice/grade6-table.js','src/modules/word/math.js'],
});
