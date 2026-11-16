import { cases,decisions } from './sites.js';
export const HOME='browser:home';
export function address(value){const text=String(value).trim().slice(0,500);if(text===HOME)return HOME;if(text.startsWith('browser:search?'))return 'browser:search?q='+encodeURIComponent(new URLSearchParams(text.slice(text.indexOf('?')+1)).get('q')?.slice(0,160)||'');if(/^https?:\/\//i.test(text)||/^[\w-]+\.[\w-]+(?:\/|$)/i.test(text)){try{const url=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);if(url.hostname.endsWith('.test'))url.protocol='https:';return url.origin+url.pathname.replace(/\/$/,'');}catch{return 'browser:search?q='+encodeURIComponent(text);}}return 'browser:search?q='+encodeURIComponent(text.slice(0,160));}
export const newTab=(url=HOME)=>({id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),history:[url],index:0});
export function blankBrowser(){const tab=newTab();return {format:'informatyka-browser',version:1,name:'Мій браузер',tabs:[tab],active:tab.id,bookmarks:[],visits:[],answers:Object.fromEntries(cases.map(c=>[c.id,{author:'',date:'',decision:'',sources:'',reason:''}]))};}
export function validateBrowser(raw){
 if(raw?.format!=='informatyka-browser'||raw.version!==1)throw new Error('Це не проєкт навчального браузера.');
 const clean=blankBrowser(),text=(value,max)=>String(value??'').slice(0,max);
 clean.name=text(raw.name||'Мій браузер',120).replace(/[\\/\x00-\x1f]/g,' ').trim()||'Мій браузер';
 if(!Array.isArray(raw.tabs)||!raw.tabs.length||raw.tabs.length>8)throw new Error('Проєкт повинен мати від 1 до 8 вкладок.');
 const ids=new Set();clean.tabs=raw.tabs.map(t=>{if(!t||!Array.isArray(t.history)||!t.history.length||t.history.length>100)throw new Error('Пошкоджена історія вкладки.');const id=text(t.id,100)||newTab().id;if(ids.has(id))throw new Error('Повторюються вкладки.');ids.add(id);return {id,history:t.history.map(address),index:Math.max(0,Math.min(t.history.length-1,Number.isInteger(t.index)?t.index:0))};});
 clean.active=ids.has(raw.active)?raw.active:clean.tabs[0].id;
 clean.bookmarks=[...new Set((Array.isArray(raw.bookmarks)?raw.bookmarks:[]).slice(0,40).map(address))];
 clean.visits=(Array.isArray(raw.visits)?raw.visits:[]).slice(0,100).filter(v=>v&&typeof v.url==='string').map(v=>({url:address(v.url),time:text(v.time,50)}));
 for(const c of cases){const a=raw.answers?.[c.id]||{};clean.answers[c.id]={author:text(a.author,300),date:text(a.date,150),decision:decisions.includes(a.decision)?a.decision:'',sources:text(a.sources,2000),reason:text(a.reason,3000)};}
 return clean;
}
export function browserBlob(state){return new Blob([JSON.stringify(validateBrowser(state))],{type:'application/json'});}
export async function readBrowser(blob){if(blob.size>2*1024*1024)throw new Error('Проєкт браузера завеликий: до 2 МБ.');let value;try{value=JSON.parse(await blob.text());}catch{throw new Error('Не вдалося прочитати проєкт браузера.');}return validateBrowser(value);}
export function reportText(state){return ['Інформаційний детектив · 4–5 класи',state.name,'Усі сайти й події в цій роботі вигадані. Навчальна дата: 14 березня 2030 року.','',...cases.flatMap((c,i)=>{const a=state.answers[c.id];return [`${i+1}. ${c.title}`,c.claim,`Стартова сторінка: ${c.url}`,`Автор: ${a.author||'—'}`,`Дата: ${a.date||'—'}`,`Висновок: ${a.decision||'Не обрано'}`,`Джерела:\n${a.sources||'—'}`,`Пояснення:\n${a.reason||'—'}`,''];})].join('\n');}
