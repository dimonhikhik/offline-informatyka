const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function parseMath(source){
  if(typeof source!=='string'||!source.trim()||source.length>300)throw new Error('Формула: від 1 до 300 символів.');
  let i=0;
  function sequence(stops='',depth=0){
    if(depth>12)throw new Error('Формула має надто багато вкладених частин.');
    const nodes=[];
    while(i<source.length&&!stops.includes(source[i])){
      let node;
      if(source.startsWith('frac(',i)){i+=5;const a=sequence(',',depth+1);expect(',');const b=sequence(')',depth+1);expect(')');node={type:'frac',a,b};}
      else if(source.startsWith('sqrt(',i)){i+=5;node={type:'root',a:sequence(')',depth+1)};expect(')');}
      else if(source[i]==='('){i++;node={type:'group',a:sequence(')',depth+1)};expect(')');}
      else if('^_'.includes(source[i]))throw new Error('Перед степенем або індексом потрібен символ чи вираз.');
      else{if(source[i]===')')throw new Error('Зайва закривна дужка.');node={type:'text',value:source[i++]};}
      while(i<source.length&&'^_'.includes(source[i])){const kind=source[i++]==='^'?'sup':'sub';let a;if(source[i]==='('){i++;a=sequence(')',depth+1);expect(')');}else if(i<source.length)a={type:'text',value:source[i++]};else throw new Error('Вкажи значення степеня або індексу.');node={type:kind,base:node,a};}
      nodes.push(node);
    }
    if(!nodes.length)throw new Error('Порожня частина формули.');return {type:'seq',nodes};
  }
  function expect(char){if(source[i++]!==char)throw new Error(`У формулі очікується «${char}».`);}
  return sequence();
}
function html(n){
  if(n.type==='seq')return n.nodes.map(html).join('');if(n.type==='text')return esc(n.value);
  if(n.type==='group')return '('+html(n.a)+')';
  if(n.type==='frac')return `<span class="wm-frac"><span>${html(n.a)}</span><span>${html(n.b)}</span></span>`;
  if(n.type==='root')return `<span class="wm-root">√<span>${html(n.a)}</span></span>`;
  return `<span>${html(n.base)}<${n.type}>${html(n.a)}</${n.type}></span>`;
}
export function formulaHTML(source){return `<span data-word-math="${esc(source)}" contenteditable="false" role="button" tabindex="0" aria-label="Редагувати формулу: ${esc(source)}">${html(parseMath(source))}</span>`;}
export function formulaXML(source){
  function xml(n){if(n.type==='seq')return n.nodes.map(xml).join('');if(n.type==='text')return `<m:r><m:t xml:space="preserve">${esc(n.value)}</m:t></m:r>`;if(n.type==='group')return xml({type:'text',value:'('})+xml(n.a)+xml({type:'text',value:')'});if(n.type==='frac')return `<m:f><m:num>${xml(n.a)}</m:num><m:den>${xml(n.b)}</m:den></m:f>`;if(n.type==='root')return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${xml(n.a)}</m:e></m:rad>`;const tag=n.type==='sup'?'sSup':'sSub';return `<m:${tag}><m:e>${xml(n.base)}</m:e><m:${n.type}>${xml(n.a)}</m:${n.type}></m:${tag}>`;}
  return `<m:oMath>${xml(parseMath(source))}</m:oMath>`;
}
export function mathSource(node){
  const children=[...node.children],get=name=>children.find(n=>n.localName===name),part=name=>get(name)?mathSource(get(name)):'';
  if(node.localName==='t')return node.textContent;
  if(node.localName==='f')return `frac(${part('num')},${part('den')})`;
  if(node.localName==='rad'){if(part('deg'))throw new Error('Підтримується квадратний корінь.');return `sqrt(${part('e')})`;}
  if(node.localName==='sSup')return `(${part('e')})^(${part('sup')})`;
  if(node.localName==='sSub')return `(${part('e')})_(${part('sub')})`;
  if(node.localName==='sSubSup')return `(${part('e')})_(${part('sub')})^(${part('sup')})`;
  if(['oMath','oMathPara','r','e','num','den','sup','sub','deg'].includes(node.localName))return children.filter(n=>!n.localName.endsWith('Pr')).map(mathSource).join('');
  throw new Error('Складна структура формули не підтримується.');
}
export const mathCSS='[data-word-math]{display:inline-block;font:1.15em "Cambria Math","Times New Roman",serif;white-space:pre-wrap;padding:3px 5px;vertical-align:middle}.wm-frac{display:inline-flex;flex-direction:column;align-items:stretch;vertical-align:middle;text-align:center;line-height:1.3;margin:0 3px}.wm-frac>span:first-child{border-bottom:1px solid currentColor;padding:0 3px}.wm-frac>span:last-child{padding:0 3px}.wm-root{display:inline-flex;align-items:center}.wm-root>span{border-top:1px solid currentColor;padding:0 3px}';
