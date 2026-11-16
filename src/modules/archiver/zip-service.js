export function createZipWorker() {
  let worker, prepared, rejectPreparation, pending;
  function stop(error) {
    worker?.terminate();
    worker=undefined;
    prepared=undefined;
    rejectPreparation?.(error);
    rejectPreparation=undefined;
    pending?.reject(error);
    pending=undefined;
  }
  function prepare() {
    if(prepared)return prepared;
    const instance=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker=instance;
    prepared=new Promise((resolve,reject)=>{
      rejectPreparation=reject;
      instance.onmessage=({data})=>{
        if(worker!==instance)return;
        if(data.ready){
          rejectPreparation=undefined;
          resolve();
          return;
        }
        const operation=pending;
        pending=undefined;
        if(data.error)operation?.reject(new Error(data.error));
        else operation?.resolve(data.result);
      };
      const fail=()=>{
        if(worker===instance)stop(new Error('Не вдалося запустити обробку ZIP. Перевір підключення й спробуй ще раз.'));
      };
      instance.onerror=fail;
      instance.onmessageerror=fail;
    });
    return prepared;
  }
  return {
    prepare,
    async run(message) {
      const ready=prepare(),instance=worker;
      await ready;
      if(worker!==instance)throw new Error('Операцію скасовано.');
      if(pending)throw new Error('Дочекайся завершення попередньої операції.');
      return new Promise((resolve,reject)=>{
        pending={resolve,reject};
        try{instance.postMessage(message);}
        catch(error){pending=undefined;reject(error);}
      });
    },
    dispose(){stop(new Error('Операцію скасовано.'));},
  };
}
