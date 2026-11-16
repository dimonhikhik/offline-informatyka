import { renderSlide } from './canvas.js';

export function printSlides(deck){
  const slides=deck.slides.filter(slide=>!slide.hidden);
  if(!slides.length)throw Error('Познач хоча б один слайд для показу й друку.');
  const frame=document.createElement('iframe');
  frame.className='ppt-print-frame';frame.title='Друк презентації';
  document.body.append(frame);
  const output=frame.contentDocument;
  output.title=deck.name;
  output.documentElement.lang='uk';
  const style=output.createElement('style');
  style.textContent=`
    @page{size:A4 landscape;margin:10mm}
    html,body{margin:0;padding:0;background:white;color:#172033}
    *{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .print-slide{height:188mm;display:grid;place-items:center;break-after:page;break-inside:avoid}
    .print-slide:last-child{break-after:auto}
    .slide-canvas{width:${deck.aspect==='standard'?250:276}mm;max-width:100%;container-type:inline-size;position:relative;overflow:hidden}
    .slide-object{position:absolute;line-height:1.15;white-space:pre-wrap;overflow-wrap:anywhere}
    .slide-object img{display:block;width:100%;height:100%}
  `;
  output.head.append(style);
  for(const slide of slides){
    const page=output.createElement('section'),stage=output.createElement('div');
    page.className='print-slide';stage.className='slide-canvas';
    renderSlide(stage,slide,{aspect:deck.aspect,links:true});
    page.append(stage);output.body.append(page);
  }
  const close=()=>frame.remove();
  const window=frame.contentWindow;
  window.addEventListener('afterprint',close,{once:true});
  setTimeout(close,120000);
  return Promise.allSettled([...output.images].map(image=>image.decode())).then(()=>{
    if(!frame.isConnected)return;
    window.focus();window.print();
  });
}
