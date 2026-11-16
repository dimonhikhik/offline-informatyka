export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.className = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter(x => x != null));
  return node;
}
export function notify(message) {
  const node = document.querySelector('#notice');
  node.textContent = message; node.hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { node.hidden = true; }, 6500);
}
export const heading = (eyebrow,title,description) => el('div',{className:'page-heading'},
  eyebrow?el('p',{className:'eyebrow'},eyebrow):null,el('h1',{},title),description?el('p',{},description):null);
export function download(blob,name) {
  const url = URL.createObjectURL(blob);
  const link = el('a',{href:url,download:name});
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
}
