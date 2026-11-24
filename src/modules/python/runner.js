import { el } from '../../components/ui.js';
import { normalizePackages } from './libraries.js';

const indexURL = new URL('../../vendor/pyodide/', import.meta.url);
let cachedSources;
let transport,attached,latest;
let configuredPackages=[];

function readSource(file) {
  return fetch(new URL(file, import.meta.url)).then(response=>{
    if(!response.ok)throw new Error('Не вдалося завантажити файли Python. Перевір підключення до ноутбука.');
    return response.text();
  });
}

function loadSources() {
  cachedSources??=Promise.all([readSource('worker.js'),readSource('tkinter.py')]).catch(error=>{
    cachedSources=undefined;
    throw error;
  });
  return cachedSources;
}

function sandboxDocument(origin) {
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: "+indexURL.href+
    "; connect-src "+indexURL.href+"; worker-src blob:; form-action 'none'; base-uri 'none'";
  // The iframe has an opaque origin. The worker inherits its policy from this Blob.
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><script>' +
    "'use strict'; const parentOrigin="+JSON.stringify(origin)+";"+
    "let worker,url; function release(){worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;}"+
    "window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==parentOrigin)return;"+
    "const {type,source,assets,sequence}=event.data||{};"+
    "if(type==='stop'){release();return;}"+
    "if(type!=='start'||!event.ports.length)return;release();"+
    "const port=event.ports[0]; try{"+
    "url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));"+
    "worker=new Worker(url);"+
    "worker.onerror=()=>parent.postMessage({type:'python-worker-error',sequence},parentOrigin);"+
    "worker.postMessage({type:'connect',port,assets},[port]);"+
    "}catch(error){port.postMessage({type:'error',message:error.message});release();}"+
    "});window.addEventListener('pagehide',release);</script>";
}

function createTransport(onMessage) {
  let sequence=0, port, timeout;
  const frame=el('iframe',{hidden:true,sandbox:'allow-scripts','aria-hidden':'true',title:'Середовище Python'});
  const frameReady=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.srcdoc=sandboxDocument(location.origin);
  document.body.append(frame);

  function stop() {
    sequence++;
    clearTimeout(timeout);
    port?.close();
    port=undefined;
    frame.contentWindow?.postMessage({type:'stop'},'*');
  }

  function fail(text) {
    stop();
    onMessage({type:'error',message:text});
  }

  function workerError(event) {
    if(event.source===frame.contentWindow&&event.origin==='null'&&event.data?.type==='python-worker-error'&&event.data.sequence===sequence){
      fail('Python не вдалося запустити в цьому браузері. Спробуй ще раз або скористайся іншим браузером.');
    }
  }
  window.addEventListener('message',workerError);

  async function start(requested=[]) {
    stop();
    const packages=normalizePackages(requested);
    configuredPackages=packages;
    const token=sequence;
    onMessage({type:'loading'});
    timeout=setTimeout(()=>{if(sequence===token)fail('Час завантаження вичерпано. Перевір Wi-Fi й повтори спробу.');},45000);
    try{
      const [[source,tkSource]]=await Promise.all([loadSources(),frameReady]);
      if(sequence!==token)return;
      const channel=new MessageChannel();
      port=channel.port1;
      port.onmessage=({data})=>{
        if(sequence!==token||!data||typeof data.type!=='string')return;
        if(data.type==='ready'||data.type==='error')clearTimeout(timeout);
        onMessage(data);
      };
      frame.contentWindow.postMessage({
        type:'start',source,sequence:token,assets:{indexURL:indexURL.href,tkSource,packages}
      },'*',[channel.port2]);
    }catch(error){
      if(sequence===token)fail(error?.message||'Не вдалося підготувати Python.');
    }
  }

  return {
    start,stop,
    send(message){port?.postMessage(message);}
  };
}

export function createRunner(onMessage,packages=[]) {
  if(!transport){
    transport=createTransport(message=>{
      if(['ready','loading','error'].includes(message.type))latest=message;
      attached?.receive(message);
    });
    window.addEventListener('pageshow',event=>{
      if(event.persisted){
        latest=undefined;
        if(attached)transport.start(attached.packages);
      }
    });
  }
  const binding={receive:onMessage,packages:normalizePackages(packages)};
  attached=binding;
  return {
    start(){
      if(attached!==binding)return;
      const samePackages=binding.packages.join(',')===configuredPackages.join(',');
      if(samePackages&&(latest?.type==='ready'||latest?.type==='loading'))onMessage(latest);
      else transport.start(binding.packages);
    },
    restart(packages=binding.packages){
      if(attached!==binding)return;
      binding.packages=normalizePackages(packages);
      transport.start(binding.packages);
    },
    send(message){if(attached===binding)transport.send(message);},
    dispose(keepReady=false){
      if(attached!==binding)return;
      attached=undefined;
      // Keep a warmed idle interpreter for navigation within the current tab.
      if(!keepReady){transport.stop();latest=undefined;}
    }
  };
}
