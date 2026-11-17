import http from 'node:http';
import { readFile,realpath,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { adminAPI } from './admin.mjs';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const lan=process.argv.includes('--lan');
const host=lan?'0.0.0.0':'127.0.0.1';
const port=4173;
const admin=adminAPI(root,port);
const pyodidePrefix='/src/vendor/pyodide/';
const pyodidePath=path.join('src','vendor','pyodide')+path.sep;
function networkLinks(){
  const links=[];
  for(const [name,addresses] of Object.entries(networkInterfaces()))for(const item of addresses||[]){
    if(item.family==='IPv4'&&!item.internal&&!item.address.startsWith('169.254.')&&!links.some(link=>link.address===item.address))
      links.push({name,address:item.address,url:`http://${item.address}:${port}/#catalog`});
  }
  return links.sort((a,b)=>Number(/virtual|vpn|vethernet|vmware|virtualbox/i.test(a.name))-Number(/virtual|vpn|vethernet|vmware|virtualbox/i.test(b.name)));
}
const mime={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.py':'text/plain; charset=utf-8','.wasm':'application/wasm','.zip':'application/zip','.whl':'application/zip'};
const server=http.createServer(async(req,res)=>{
  const fail=(code,message)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);};
  try{
    const encodedPath=new URL(req.url,'http://localhost').pathname;
    const pathname=decodeURIComponent(encodedPath);
    const pyodideRequest=encodedPath.startsWith(pyodidePrefix)||pathname.startsWith(pyodidePrefix);
    if(await admin(req,res,pathname))return;
    if(!['GET','HEAD'].includes(req.method)){fail(405,'Метод не підтримується');return;}
    if(pathname==='/api/local-network'){
      const bytes=Buffer.from(JSON.stringify({lan,links:lan?networkLinks():[]}));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);return;
    }
    if(pathname!=='/'&&pathname!=='/index.html'&&!pathname.startsWith('/src/')&&!pathname.startsWith('/public/')){fail(404,'Не знайдено');return;}
    const target=await realpath(path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
    const relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)){fail(403,'Доступ заборонено');return;}
    const pyodide=relative.startsWith(pyodidePath);
    if(pyodideRequest&&!pyodide){fail(403,'Доступ заборонено');return;}
    if(!(await stat(target)).isFile()){fail(404,'Не знайдено');return;}
    const type=mime[path.extname(target)];
    if(!type){fail(403,'Доступ заборонено');return;}
    const bytes=await readFile(target);
    const cache=pyodide?'public, max-age=31536000, immutable':'no-cache';
    res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      ...(pyodide?{'Access-Control-Allow-Origin':'*'}:{})});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){fail(error.code==='ENOENT'?404:400,'Файл недоступний');}
});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?'Порт 4173 зайнятий. Якщо платформа вже запущена, відкрийте http://localhost:4173. Інакше закрийте програму, що займає порт.':error.message);
  process.exitCode=1;
});
server.listen(port,host,()=>{
  console.log('\nінформатика:офлайн · локальна версія 0.5.1');
  console.log(`На цьому ПК: http://localhost:${port}`);
  console.log(`Адмінка для вчителя: http://localhost:${port}/#admin`);
  if(lan){
    console.log(`QR-код для учнів: http://localhost:${port}/#connect`);
    for(const addresses of Object.values(networkInterfaces()))for(const item of addresses||[])
      if(item.family==='IPv4'&&!item.internal)console.log(`Можлива адреса у локальній мережі: http://${item.address}:${port}`);
    console.log('Обирайте адресу Wi-Fi або Ethernet. Дозвіл брандмауера — лише для приватної мережі.');
    console.log('Дані кожного учня зберігаються в його браузері. PWA через LAN HTTP недоступна.');
  }
  console.log('Не закривайте це вікно. Для зупинки натисніть Ctrl+C.\n');
  if(process.platform==='win32'){
    const child=spawn('cmd.exe',['/c','start','',`http://localhost:${port}/${lan?'#connect':''}`],{stdio:'ignore'});
    child.on('error',()=>console.log('Відкрийте адресу вручну у браузері.'));
  }
});
