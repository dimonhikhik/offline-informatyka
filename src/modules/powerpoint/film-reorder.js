const itemSelector='.ppt-film-item[data-slide-index]';
const handleSelector='[data-film-reorder]';

export function bindFilmReorder(film,{onMove,onAnnounce}){
  let gesture=null,frame=0,lastTick=0;
  const items=()=>[...film.children].filter(item=>item.matches(itemSelector));
  const horizontal=()=>getComputedStyle(film).flexDirection.startsWith('row');

  function clearMarker(session){
    session.marker?.removeAttribute('data-reorder-edge');
    session.marker=null;
    session.to=null;
  }

  function finish(){
    const session=gesture;
    gesture=null;
    if(frame)cancelAnimationFrame(frame);
    frame=0;
    lastTick=0;
    if(!session)return;
    clearMarker(session);
    session.preview?.node.remove();
    session.item.classList.remove('is-reorder-source');
    film.classList.remove('is-reordering');
    if(film.hasPointerCapture(session.pointer))film.releasePointerCapture(session.pointer);
  }

  function inLane(session,bounds){
    const point=session.horizontal?session.y:session.x;
    const start=session.horizontal?bounds.top:bounds.left;
    const end=session.horizontal?bounds.bottom:bounds.right;
    return point>=start-44&&point<=end+44;
  }

  function setTarget(session,rows){
    const position=session.horizontal?session.x:session.y;
    let slot=rows.findIndex(row=>{
      const bounds=row.getBoundingClientRect();
      return position<(session.horizontal?bounds.left+bounds.width/2:bounds.top+bounds.height/2);
    });
    if(slot<0)slot=rows.length;
    const to=slot>session.from?slot-1:slot;
    if(to===session.from){clearMarker(session);return;}
    const marker=rows[Math.min(slot,rows.length-1)];
    const edge=slot<rows.length?'before':'after';
    if(session.marker!==marker)session.marker?.removeAttribute('data-reorder-edge');
    if(marker.getAttribute('data-reorder-edge')!==edge)marker.setAttribute('data-reorder-edge',edge);
    session.to=to;
    session.marker=marker;
  }

  function inspect(session){
    const rows=items(),bounds=film.getBoundingClientRect();
    if(rows[session.from]!==session.item||!bounds.width||!bounds.height||horizontal()!==session.horizontal){
      finish();
      return null;
    }
    if(!inLane(session,bounds)){
      clearMarker(session);
      lastTick=0;
      return null;
    }
    return {rows,bounds};
  }

  function autoscroll(session,bounds,now){
    const start=session.horizontal?bounds.left:bounds.top;
    const end=session.horizontal?bounds.right:bounds.bottom;
    const position=session.horizontal?session.x:session.y;
    const zone=Math.min(48,(end-start)/3);
    const towardStart=Math.max(0,Math.min(1,(start+zone-position)/zone));
    const towardEnd=Math.max(0,Math.min(1,(position-(end-zone))/zone));
    const delta=(towardEnd-towardStart)*Math.min(lastTick?now-lastTick:16,32);
    lastTick=now;
    if(!delta)return false;
    const axis=session.horizontal?'scrollLeft':'scrollTop',before=film[axis];
    film[axis]+=Math.sign(delta)*Math.max(1,Math.abs(delta));
    return film[axis]!==before;
  }

  function startPreview(session){
    const host=film.closest('.powerpoint'),thumbnail=session.item.querySelector('.slide-thumbnail');
    if(!host||!thumbnail)return;
    const {width,height}=thumbnail.getBoundingClientRect();
    const node=document.createElement('div'),copy=thumbnail.cloneNode(true);
    node.className='ppt-film-drag-preview';
    node.setAttribute('aria-hidden','true');
    node.inert=true;
    copy.tabIndex=-1;
    Object.assign(node.style,{position:'fixed',left:'0',top:'0',width:`${width}px`,pointerEvents:'none'});
    node.append(copy);
    host.append(node);
    session.preview={node,width,height};
    movePreview(session);
  }

  function movePreview(session){
    if(!session.preview)return;
    const {node,width,height}=session.preview;
    const left=Math.min(Math.max(4,window.innerWidth-width-4),Math.max(4,session.x-Math.min(24,width/2)));
    const offsetY=session.touch?height+13:Math.min(16,height/2);
    const top=Math.min(Math.max(4,window.innerHeight-height-4),Math.max(4,session.y-offsetY));
    node.style.transform=`translate3d(${left}px,${top}px,0)`;
  }

  function tick(now){
    frame=0;
    const session=gesture;
    if(!session?.dragging)return;
    const layout=inspect(session);
    if(gesture===session)movePreview(session);
    if(!layout)return;
    const scrolled=autoscroll(session,layout.bounds,now);
    setTarget(session,layout.rows);
    if(scrolled)frame=requestAnimationFrame(tick);
  }

  function pointerDown(event){
    if(gesture||event.button!==0||event.isPrimary===false)return;
    const handle=event.target.closest(handleSelector);
    const item=handle?.closest(itemSelector);
    if(item?.parentElement!==film)return;
    const rows=items(),from=rows.indexOf(item);
    if(from<0||rows.length<2)return;
    event.preventDefault();
    handle.focus({preventScroll:true});
    film.setPointerCapture(event.pointerId);
    const across=horizontal();
    gesture={
      pointer:event.pointerId,item,from,horizontal:across,
      start:across?event.clientX:event.clientY,x:event.clientX,y:event.clientY,
      threshold:event.pointerType==='mouse'?4:7,touch:event.pointerType==='touch',dragging:false,marker:null,to:null
    };
  }

  function pointerMove(event){
    const session=gesture;
    if(session?.pointer!==event.pointerId)return;
    session.x=event.clientX;
    session.y=event.clientY;
    if(!session.dragging){
      const position=session.horizontal?session.x:session.y;
      if(Math.abs(position-session.start)<session.threshold)return;
      session.dragging=true;
      startPreview(session);
      session.item.classList.add('is-reorder-source');
      film.classList.add('is-reordering');
    }
    if(!frame)frame=requestAnimationFrame(tick);
  }

  function commit(from,to,count,restoreFocus=false){
    if(from===to||onMove(from,to)===false)return;
    if(restoreFocus){
      const handle=items()[to]?.querySelector(handleSelector);
      handle?.focus({preventScroll:true});
      handle?.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    onAnnounce?.(`Слайд переміщено на місце ${to+1} із ${count}.`);
  }

  function pointerUp(event){
    const session=gesture;
    if(session?.pointer!==event.pointerId)return;
    session.x=event.clientX;
    session.y=event.clientY;
    const layout=session.dragging?inspect(session):null;
    if(layout)setTarget(session,layout.rows);
    const {from,to}=session;
    finish();
    if(layout&&to!==null)commit(from,to,layout.rows.length);
  }

  function pointerCancel(event){
    if(event.type==='lostpointercapture'&&event.target!==film)return;
    if(gesture?.pointer===event.pointerId)finish();
  }

  function moveWithKeys(event){
    if(gesture||event.altKey||event.ctrlKey||event.metaKey)return;
    const item=event.target.closest(handleSelector)?.closest(itemSelector);
    if(item?.parentElement!==film)return;
    const rows=items(),from=rows.indexOf(item),last=rows.length-1;
    if(from<0||last<1)return;
    const directions={ArrowLeft:from-1,ArrowUp:from-1,ArrowRight:from+1,ArrowDown:from+1,Home:0,End:last};
    if(!Object.hasOwn(directions,event.key))return;
    event.preventDefault();
    commit(from,Math.max(0,Math.min(last,directions[event.key])),rows.length,true);
  }

  function escape(event){
    if(event.key!=='Escape'||!gesture)return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  }

  film.addEventListener('pointerdown',pointerDown);
  film.addEventListener('pointermove',pointerMove);
  film.addEventListener('pointerup',pointerUp);
  film.addEventListener('pointercancel',pointerCancel);
  film.addEventListener('lostpointercapture',pointerCancel);
  film.addEventListener('keydown',moveWithKeys);
  window.addEventListener('keydown',escape,true);
  window.addEventListener('blur',finish);
  window.addEventListener('resize',finish);
  return ()=>{
    finish();
    film.removeEventListener('pointerdown',pointerDown);
    film.removeEventListener('pointermove',pointerMove);
    film.removeEventListener('pointerup',pointerUp);
    film.removeEventListener('pointercancel',pointerCancel);
    film.removeEventListener('lostpointercapture',pointerCancel);
    film.removeEventListener('keydown',moveWithKeys);
    window.removeEventListener('keydown',escape,true);
    window.removeEventListener('blur',finish);
    window.removeEventListener('resize',finish);
  };
}
