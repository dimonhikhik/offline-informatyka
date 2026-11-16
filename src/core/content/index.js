import { emptyContent,validateContent,textFields } from './schema.js';
let content=emptyContent();
export const getContent=()=>structuredClone(content);
export const hasSiteText=key=>Object.hasOwn(content.texts,key);
export function siteText(key,fallback=''){return Object.hasOwn(content.texts,key)?content.texts[key]:(textFields.find(f=>f[0]===key)?.[2]??fallback);}
export function setContent(value){content=validateContent(value);window.dispatchEvent(new Event('site-content-changed'));}
export async function loadContent(){
  try{const response=await fetch(new URL('../../../public/site-content.json',import.meta.url),{cache:'no-store'});if(response.status===404)return;if(!response.ok)throw Error('Матеріали сайту недоступні');setContent(await response.json());}
  catch(error){console.warn('Не вдалося завантажити матеріали вчителя:',error);throw error;}
}
export function refreshSiteTexts(){document.title=siteText('site.title');document.querySelectorAll('[data-site-text]').forEach(node=>{node.textContent=siteText(node.dataset.siteText,node.textContent);});}
