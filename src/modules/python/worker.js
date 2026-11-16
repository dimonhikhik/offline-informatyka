(() => {
  const maxOutput = 16000, maxSource = 256 * 1024, maxFiles = 24;
  const packageNames = ['numpy','pillow','sympy','mpmath','tzdata'];
  const stringify = JSON.stringify, parse = JSON.parse;
  let send, pyodide, prepare, flushPython, dispatchTk, resetTk, available = [];
  let running = false, dispatching = false, inputReply, tkReply, stdin = [], tkEvents = [];
  let waitedForInput = false;
  let interactive = false, interactiveInput = false, workspaceId = 0;
  let outputLeft = maxOutput, outputLimited = false, outputTimer;
  let pendingView, viewTimer;
  const output = [];
  const decoders = new Map([['stdout',new TextDecoder()],['stderr',new TextDecoder()]]);

  function cleanError(error) {
    return String(error?.message || error).trim().slice(0,10000);
  }
  function flushOutput() {
    clearTimeout(outputTimer);
    outputTimer = undefined;
    for (const chunk of output) if (chunk.text) send(chunk);
    output.length = 0;
  }
  function addOutput(stream,text) {
    const last = output.at(-1);
    if (last?.stream === stream) last.text += text;
    else if (text) output.push({type:'output',stream,text});
  }
  function write(stream, bytes) {
    const allowed = Math.min(bytes.byteLength, outputLeft);
    if (allowed) {
      outputLeft -= allowed;
      const chunk = decoders.get(stream).decode(bytes.subarray(0,allowed),{stream:true});
      addOutput(stream,chunk);
      if (!outputTimer) outputTimer = setTimeout(flushOutput,40);
    }
    if (allowed < bytes.byteLength && !outputLimited) {
      outputLimited = true;
      flushOutput();
      send({type:'output',stream:'stderr',text:'\n[Вивід скорочено.]\n'});
    }
    return bytes.byteLength;
  }
  function finishOutput() {
    try { flushPython?.(); } catch { /* A program may close its streams. */ }
    for (const [stream,decoder] of decoders) {
      const tail = decoder.decode();
      if (tail && !outputLimited) addOutput(stream,tail);
    }
    flushOutput();
  }

  function nextInput(prompt) {
    if ((!running && !dispatching) || inputReply) return Promise.resolve();
    return new Promise(resolve => {
      inputReply = resolve;
      waitedForInput = true;
      flushOutput();
      flushTk();
      send({type:'input',prompt:String(prompt).slice(0,500)});
    });
  }
  function publishTk(text) {
    if (typeof text !== 'string' || text.length > 512 * 1024) return;
    const model = parse(text);
    if (!Array.isArray(model?.windows)) return;
    interactive = model.windows.length > 0 || !!model.dialog;
    pendingView = model;
    if (!viewTimer) viewTimer = setTimeout(flushTk,16);
  }
  function flushTk() {
    clearTimeout(viewTimer);
    viewTimer = undefined;
    if (!pendingView) return;
    send({type:'tk',model:pendingView});
    pendingView = undefined;
  }
  function wakeTk() {
    if (!tkReply) return;
    const resolve = tkReply;
    tkReply = undefined;
    resolve('{}');
  }
  function nextTkEvent() {
    flushTk();
    const message = tkEvents.shift();
    if (message) return Promise.resolve(stringify(message));
    return new Promise(resolve => { tkReply = resolve; });
  }
  function deliverTk(event) {
    if (!interactive || !Number.isSafeInteger(event.id) || event.id < 1
      || typeof event.event !== 'string' || event.event.length > 32) return;
    const bounded = {type:'tk-event',id:event.id,event:event.event};
    if (typeof event.value === 'string') bounded.value = event.value.slice(0,20000);
    else if (typeof event.value === 'boolean' || Number.isFinite(event.value)) bounded.value = event.value;
    else if (Array.isArray(event.value)) bounded.value = event.value.slice(0,250).filter(Number.isSafeInteger);
    if (typeof event.key === 'string') bounded.key = event.key.slice(0,32);
    if (Number.isFinite(event.x)) bounded.x = event.x;
    if (Number.isFinite(event.y)) bounded.y = event.y;
    for (const name of ['button','cursor','revision']) if (Number.isSafeInteger(event[name])) bounded[name] = event[name];
    if (tkReply) {
      const resolve = tkReply;
      tkReply = undefined;
      resolve(stringify(bounded));
    } else if (tkEvents.length < 50) {
      tkEvents.push(bounded);
      void processTk();
    }
  }
  async function processTk() {
    if (running || dispatching || !interactive || !tkEvents.length) return;
    dispatching = true;
    waitedForInput = false;
    let ok = true;
    try {
      while (interactive && tkEvents.length) {
        const event = stringify(tkEvents.shift());
        if (interactiveInput) await dispatchTk.callPromising(event);
        else dispatchTk(event);
      }
    } catch (error) {
      ok = false;
      finishOutput();
      send({type:'output',stream:'stderr',text:cleanError(error)+'\n'});
    } finally {
      dispatching = false;
      inputReply = undefined;
      finishOutput();
      flushTk();
      if (waitedForInput || !interactive) send({type:'done',ok,interactive});
    }
  }
  function validFileName(name) {
    return typeof name === 'string' && name.length >= 4 && name.length <= 128
      && !/[\\/\u0000-\u001f\u007f]/.test(name) && /\.(py|txt|csv|json)$/i.test(name);
  }
  async function run(message) {
    if (running || dispatching) {
      send({type:'error',fatal:false,message:'Дочекайся завершення поточної дії.'});
      return;
    }
    running = true;
    stdin = [];
    tkEvents = [];
    interactive = false;
    outputLeft = maxOutput;
    outputLimited = false;
    let ok = false;
    try {
      const {code} = message;
      if (typeof code !== 'string' || code.length > maxSource) {
        throw new Error('Програма перевищує допустимий розмір.');
      }
      if (Array.isArray(message.stdin)) {
        stdin = message.stdin.slice(0,400).filter(value => typeof value === 'string').map(value => value.slice(0,8192));
      }
      const name = validFileName(message.name) && /\.py$/i.test(message.name) ? message.name : 'main.py';
      const seen = new Set([name]);
      let size = code.length;
      const files = Array.isArray(message.files) ? message.files : [];
      if (files.length > maxFiles) throw new Error('Забагато файлів у проєкті.');
      for (const aux of files) {
        if (!validFileName(aux?.name) || seen.has(aux.name) || typeof aux.text !== 'string'
          || aux.text.length > maxSource || (size += aux.text.length) > 4 * maxSource) {
          throw new Error('Перевір назви та обсяг доданих файлів Python.');
        }
        seen.add(aux.name);
      }
      const directory = '/tmp/classroom-project-'+(++workspaceId);
      pyodide.FS.mkdirTree(directory);
      const file = directory+'/'+name;
      pyodide.FS.writeFile(file,code);
      for (const aux of files) pyodide.FS.writeFile(directory+'/'+aux.name,aux.text);
      const globals = prepare(directory,name);
      try {
        const result = await pyodide.runPythonAsync(code,{globals,filename:file});
        result?.destroy?.();
      } finally {
        globals.destroy();
      }
      ok = true;
    } catch (error) {
      finishOutput();
      send({type:'output',stream:'stderr',text:cleanError(error)+'\n'});
      try { resetTk?.(); } catch { /* Restore the editor even after a runtime error. */ }
    } finally {
      running = false;
      tkReply = inputReply = undefined;
      finishOutput();
      flushTk();
      send({type:'done',ok,interactive});
      void processTk();
    }
  }
  function receive({data}) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'run') void run(data);
    if (data.type === 'tk-event') deliverTk(data);
    if (data.type === 'input' && inputReply) {
      const resolve = inputReply;
      inputReply = undefined;
      resolve(data.value == null ? undefined : String(data.value).slice(0,8192));
    }
  }

  async function initialize(assets, port) {
    send = port.postMessage.bind(port);
    try {
      const {indexURL,tkSource} = assets || {};
      const {loadPyodide} = await import(new URL('pyodide.mjs',indexURL).href);
      pyodide = await loadPyodide({indexURL,lockFileURL:new URL('classroom-lock.json',indexURL).href,packageBaseUrl:indexURL});
      pyodide.setStdout({write:bytes=>write('stdout',bytes)});
      pyodide.setStderr({write:bytes=>write('stderr',bytes)});
      pyodide.setStdin({stdin:()=>stdin.shift()});
      const bridge = {publish:publishTk,nextEvent:nextTkEvent,wake:wakeTk};
      pyodide.registerJsModule('_school_tk',bridge);
      pyodide.registerJsModule('_school_runtime',{ask:nextInput,read:()=>stdin.shift()});
      pyodide.FS.mkdirTree('/classroom-support');
      pyodide.FS.writeFile('/classroom-support/tkinter.py',tkSource);
      const globals = pyodide.runPython('{}');
      try {
        pyodide.runPython(`
import builtins as _builtins
import os as _os
import sys as _sys
import shutil as _shutil
from pyodide.ffi import can_run_sync as _can_run_sync, run_sync as _run_sync
from _school_runtime import ask as _ask, read as _read

_sys.path.insert(0, "/classroom-support")
import tkinter as _tk
_paths = tuple(_sys.path)
_stdin, _stdout, _stderr = _sys.stdin, _sys.stdout, _sys.stderr
_previous_directory = None

def _input(prompt=""):
    prompt = str(prompt)
    value = _read()
    if value is not None:
        if prompt:
            print(prompt, end="", flush=True)
        return value
    if _can_run_sync():
        value = _run_sync(_ask(prompt))
        if value is not None:
            return value
    raise EOFError("Додай рядки в “Рядки для input()” на панелі “Вивід”.")

def _prepare(directory, name):
    global _previous_directory
    _sys.stdin, _sys.stdout, _sys.stderr = _stdin, _stdout, _stderr
    _tk._reset()
    if _previous_directory:
        _os.chdir("/home/pyodide")
        for _name, _module in list(_sys.modules.items()):
            _file = getattr(_module, "__file__", None)
            if isinstance(_file, str) and _file.startswith(_previous_directory + "/"):
                _sys.modules.pop(_name, None)
        _shutil.rmtree(_previous_directory, ignore_errors=True)
    _previous_directory = directory
    _os.chdir(directory)
    _sys.path = [directory, *_paths]
    _sys.argv = [name]
    _builtins.input = _input
    return {"__name__": "__main__", "__file__": directory + "/" + name}

def _flush():
    _tk._flush()
    _stdout.flush()
    _stderr.flush()

_dispatch_tk = _tk._dispatch
_reset_tk = _tk._reset
`,{globals});
        prepare = globals.get('_prepare');
        flushPython = globals.get('_flush');
        dispatchTk = globals.get('_dispatch_tk');
        resetTk = globals.get('_reset_tk');
      } finally {
        globals.destroy();
      }
      interactiveInput = await pyodide.runPythonAsync('from pyodide.ffi import can_run_sync; can_run_sync()');
      send({type:'status',message:'Готуємо локальні бібліотеки…'});
      const bundled = packageNames.filter(name=>Object.hasOwn(pyodide.lockfile.packages,name));
      const results = await Promise.allSettled(bundled.map(name=>pyodide.loadPackage(name,{messageCallback:()=>{},errorCallback:()=>{}})));
      available = bundled.filter((_,i)=>results[i].status==='fulfilled');
      finishOutput();
      port.addEventListener('message',receive);
      port.start();
      send({type:'ready',version:pyodide.runPython('import sys; sys.version.split()[0]'),interactiveInput,packages:available});
    } catch (error) {
      send({type:'error',message:cleanError(error),fatal:true});
    }
  }

  addEventListener('message',function connect({data}) {
    if (data?.type !== 'connect' || !data.port) return;
    removeEventListener('message',connect);
    void initialize(data.assets,data.port);
  });
})();
