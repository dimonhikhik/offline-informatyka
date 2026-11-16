export const task={
  id:'text-2',grade:9,title:'Практична робота № 2',subtitle:'Створення текстового документа, що містить об’єкти різних типів',
  asset:'public/practice/grade9-text-2.docx',
  parts:[{name:'Практична робота 2.1',label:'Текст із заготовки'},{name:'Практична робота 2.2',label:'Документ із формулами'}],
  formulas:[['а) Густина твердого тіла','ρ = ρ_(0) frac(P,P - P_(1))'],['б) Хімічний вираз','KMnO_(4) → K_(2)MnO_(4) + MnO_(2) + O_(2)'],['в) Рівність із дробами','frac(3x^(2) + 7,4) - frac(x^(3) - 3,2) = frac(5x + 2,8)']]
};
const key='informatyka.practice.9.text-2.v1';
export function loadProgress(){try{const state=JSON.parse(localStorage.getItem(key)||'{}');return {files:Array.isArray(state.files)?state.files.slice(0,2):[],done:[]};}catch{return {files:[],done:[]};}}
export function saveProgress(state){try{localStorage.setItem(key,JSON.stringify(state));return true;}catch{return false;}}
