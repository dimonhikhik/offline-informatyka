import { readFile,writeFile,rename,unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { validateContent,emptyContent } from '../src/core/content/schema.js';
export function adminAPI(root,port){
  const token=randomBytes(32).toString('hex'),file=path.join(root,'public','site-content.json');let writing=false;
  const isTeacher=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&[`localhost:${port}`,`127.0.0.1:${port}`,`[::1]:${port}`].includes(req.headers.host);
  async function read(){try{return validateContent(JSON.parse(await readFile(file,'utf8')));}catch(error){if(error.code==='ENOENT')return emptyContent();throw error;}}
  return async(req,res,pathname)=>{
    if(!pathname.startsWith('/api/admin/'))return false;
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    if(!isTeacher(req)){reply(403,{error:'Адмінка доступна лише на комп’ютері сервера через http://localhost:'+port+'/#admin'});return true;}
    if(pathname==='/api/admin/session'&&req.method==='GET'){reply(200,{token});return true;}
    if(pathname!=='/api/admin/content'){reply(404,{error:'Не знайдено'});return true;}
    if(req.method==='GET'){try{reply(200,await read());}catch{reply(500,{error:'Не вдалося прочитати site-content.json. Віднови файл із резервної копії.'});}return true;}
    if(req.method!=='POST'){reply(405,{error:'Метод не підтримується'});return true;}
    if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-admin-token']!==token||!req.headers['content-type']?.startsWith('application/json')){reply(403,{error:'Сеанс адміністратора завершився. Онови адмінку.'});return true;}
    if(writing){reply(409,{error:'Триває інше збереження. Спробуй ще раз.'});return true;}
    writing=true;let temp;
    try{
      let total=0;const chunks=[];for await(const chunk of req){total+=chunk.length;if(total>28*1024*1024)throw Error('Матеріали перевищують дозволений розмір.');chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')),next=validateContent(input),current=await read();
      if(next.revision!==current.revision){reply(409,{error:'Матеріали вже змінені в іншій вкладці. Експортуй свою чернетку, потім онови дані.'});return true;}
      next.revision=current.revision+1;
      await writeFile(path.join(root,'local-server','site-content.backup.json'),JSON.stringify(current),'utf8');
      temp=path.join(root,'public',`site-content-${randomBytes(8).toString('hex')}.tmp`);
      await writeFile(temp,JSON.stringify(next,null,2),'utf8');await rename(temp,file);temp=undefined;reply(200,next);
    }catch(error){reply(400,{error:error.message||'Збереження не виконано.'});}
    finally{writing=false;if(temp)await unlink(temp).catch(()=>{});}
    return true;
  };
}
