export function bindWheelZoom(viewport,surface,{current,zoom,blocked}){
  const wheel=event=>{
    if((!event.ctrlKey&&!event.metaKey)||event.deltaY===0||blocked())return;
    event.preventDefault();
    const previous=current(),before=surface.getBoundingClientRect();
    const x=(event.clientX-before.left)/previous,y=(event.clientY-before.top)/previous;
    zoom(previous*(event.deltaY<0?1.15:1/1.15));
    const next=current();
    if(next===previous)return;
    const after=surface.getBoundingClientRect();
    viewport.scrollLeft+=after.left+x*next-event.clientX;
    viewport.scrollTop+=after.top+y*next-event.clientY;
  };
  viewport.addEventListener('wheel',wheel,{passive:false});
  return ()=>viewport.removeEventListener('wheel',wheel);
}
