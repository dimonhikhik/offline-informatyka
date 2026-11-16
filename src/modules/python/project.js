export const projectExtension = '.python.json';
export const maxFileSize = 160000;
export const maxTotalSize = 400000;
const maxFiles = 16;
const allowedName = /^[\p{L}\p{N}_][\p{L}\p{N}_. -]{0,74}\.(?:py|txt|csv|json)$/iu;

export function cleanProjectName(value) {
  return String(value).trim().replace(/(?:\.python\.json|\.py)$/i,'').replace(/[\\/\x00-\x1f]/g,' ').trim().slice(0,125)||'Моя програма';
}

export function blankProject(example) {
  return {
    entry:'main.py',files:[{name:'main.py',text:example?.code??'print("Привіт, світе!")\n'}],
    input:example?.input??''
  };
}

export function checkFilename(name,project,previous) {
  const value=String(name).trim();
  if(!allowedName.test(value))throw new Error('Вкажи назву файла з розширенням .py, .txt, .csv або .json.');
  if(project.files.some(file=>file.name!==previous&&file.name.toLowerCase()===value.toLowerCase())){
    throw new Error('Файл із такою назвою вже існує.');
  }
  return value;
}

export function addProjectFile(project,name,text='') {
  const value=checkFilename(name,project);
  if(project.files.length>=maxFiles)throw new Error('У проєкті може бути до '+maxFiles+' файлів.');
  if(text.length>maxFileSize||project.files.reduce((size,file)=>size+file.text.length,0)+text.length>maxTotalSize){
    throw new Error('Зменш обсяг файлів проєкту.');
  }
  project.files.push({name:value,text});
  return value;
}

function validate(raw) {
  if(raw?.format!=='informatyka-python'||raw.version!==1||!Array.isArray(raw.files)){
    throw new Error('Непідтримуваний проєкт Python.');
  }
  const project={entry:raw.entry,files:[],input:typeof raw.input==='string'?raw.input.slice(0,20000):''};
  for(const file of raw.files){
    if(typeof file?.name!=='string'||typeof file?.text!=='string')throw new Error('Пошкоджений файл проєкту.');
    addProjectFile(project,file.name,file.text);
  }
  if(typeof project.entry!=='string'||!/\.py$/i.test(project.entry)||!project.files.some(file=>file.name===project.entry)){
    throw new Error('У проєкті має бути головний файл Python.');
  }
  return project;
}

export async function readProject(blob,name) {
  if(blob.size>2000000)throw new Error('Файл проєкту має бути меншим за 2 МБ.');
  const text=(await blob.text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(name.toLowerCase().endsWith(projectExtension)){
    let data;
    try{data=JSON.parse(text);}catch{throw new Error('Проєкт Python пошкоджений.');}
    return validate(data);
  }
  if(!/\.py$/i.test(name)||text.length>maxFileSize)throw new Error('Вибери файл .py або проєкт .python.json.');
  const filename=allowedName.test(name)?name.replace(/\.py$/i,'.py'):'main.py';
  return {entry:filename,files:[{name:filename,text}],input:''};
}

export function projectBlob(project) {
  const payload={format:'informatyka-python',version:1,...project};
  validate(payload);
  return new Blob([JSON.stringify(payload)],{type:'application/json;charset=utf-8'});
}

export function scriptBlob(text) {
  return new Blob([text],{type:'text/x-python;charset=utf-8'});
}
