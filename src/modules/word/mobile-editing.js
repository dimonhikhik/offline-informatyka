export const wordMobileMedia='(max-width: 760px), (max-width: 1000px) and (pointer: coarse)';

// Only a deliberate document tap should request the software keyboard.
export function mobileEditing(host,editor,remember){
  const media=matchMedia(wordMobileMedia);let typing=false,disposed=false,deliberateFocus=false;
  function quiet(){if(!media.matches)return;typing=false;editor.setAttribute('inputmode','none');}
  function pause(){
    if(!media.matches)return;
    const focused=editor.contains(document.activeElement);
    if(focused)remember();
    quiet();
    if(focused)document.activeElement.blur();
  }
  function controls(e){
    if(!media.matches||editor.contains(e.target)||e.target.closest('[data-word-immediate]'))return;
    if(host.contains(e.target)||e.target.closest('.word-dialog'))pause();
  }
  function documentDown(e){if(!media.matches)return;if(e.target.closest('[contenteditable="false"],a,img'))pause();else if(!typing)quiet();}
  function documentTap(e){
    if(!media.matches||e.defaultPrevented||editor.contentEditable==='false'||e.target.closest('[contenteditable="false"],a,img'))return;
    const wasQuiet=editor.getAttribute('inputmode')==='none',selection=getSelection(),r=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
    deliberateFocus=true;
    try{
      if(wasQuiet&&editor.contains(document.activeElement))document.activeElement.blur();
      typing=true;editor.setAttribute('inputmode','text');editor.focus({preventScroll:true});
      if(r&&editor.contains(r.startContainer)&&editor.contains(r.endContainer)){selection.removeAllRanges();selection.addRange(r);}
    }finally{deliberateFocus=false;}
  }
  function focusOut(){if(media.matches&&!deliberateFocus)quiet();}
  function mode(){typing=false;if(media.matches)editor.setAttribute('inputmode','none');else editor.removeAttribute('inputmode');}
  document.addEventListener('pointerdown',controls,true);
  editor.addEventListener('pointerdown',documentDown,true);
  // Registered after table selection: a drag's suppressed click cannot start typing.
  editor.addEventListener('click',documentTap,true);editor.addEventListener('blur',focusOut);
  media.addEventListener('change',mode);mode();
  return {pause,quiet,beforeRestore(){if(media.matches&&!typing){quiet();queueMicrotask(()=>{if(!disposed&&!typing&&editor.contains(document.activeElement))document.activeElement.blur();});}},isMobile:()=>media.matches,dispose(){disposed=true;document.removeEventListener('pointerdown',controls,true);editor.removeEventListener('pointerdown',documentDown,true);editor.removeEventListener('click',documentTap,true);editor.removeEventListener('blur',focusOut);media.removeEventListener('change',mode);editor.removeAttribute('inputmode');}};
}
