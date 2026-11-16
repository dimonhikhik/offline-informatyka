export const paragraphStyles = {
  normal: {label:'Звичайний текст', tag:'p', word:'Normal'},
  title: {label:'Назва', tag:'p', word:'Title', size:30, bold:true, after:10},
  subtitle: {label:'Підзаголовок', tag:'p', word:'Subtitle', size:15, after:12},
  h1: {label:'Заголовок 1', tag:'h1', word:'Heading1', size:24, bold:true, level:1},
  h2: {label:'Заголовок 2', tag:'h2', word:'Heading2', size:20, bold:true, level:2},
  h3: {label:'Заголовок 3', tag:'h3', word:'Heading3', size:16, bold:true, level:3},
  h4: {label:'Заголовок 4', tag:'h4', word:'Heading4', size:14, bold:true, level:4},
  quote: {label:'Цитата', tag:'blockquote', word:'Quote', italic:true, before:12, after:12}
};

export const tablePresets = {
  grid: {label:'Сітка', word:'InformatykaTableGrid', border:'#64748b', header:'#e2e8f0'},
  blue: {label:'Блакитні смуги', word:'InformatykaTableBlue', border:'#6688ae', header:'#bfdbfe', band:'#eff6ff'},
  green: {label:'Зелені смуги', word:'InformatykaTableGreen', border:'#608574', header:'#c5ead9', band:'#edf9f1'}
};

export const imagePresets = {
  frame: {label:'Рамка', border:{color:'#31659b',width:2}},
  rounded: {label:'Заокруглені кути', radius:14},
  shadow: {label:'Тінь', shadow:true}
};

export const objectStylesCSS = Object.entries(imagePresets).map(([key,style])=>{
  const border=style.border?`border:${style.border.width}px solid ${style.border.color};`:'';
  const radius=style.radius?`border-radius:${style.radius}px;`:'';
  const shadow=style.shadow?'box-shadow:2px 3px 7px #17203370;':'';
  return `img[data-word-image-style="${key}"]{${border}${radius}${shadow}}`;
}).join('');

export function outlineLevel(node) {
  const explicit=Number(node.getAttribute('data-word-outline-level'));
  return Number.isInteger(explicit)&&explicit>=1&&explicit<=9?explicit:paragraphStyles[paragraphStyleId(node)].level||0;
}

export const documentThemes = {
  classic: {label:'Класичний', font:'Arial', heading:'Arial', size:12, line:1.5, after:8, accent:'#172033'},
  academic: {label:'Академічний', font:'Times New Roman', heading:'Times New Roman', serif:true, size:14, line:1.5, after:8, accent:'#242424'},
  modern: {label:'Сучасний', font:'Arial', heading:'Georgia', headingSerif:true, size:12, line:1.35, after:10, accent:'#164f91'},
  compact: {label:'Компактний', font:'Verdana', heading:'Verdana', size:11, line:1.15, after:4, accent:'#235c51', headingScale:.85}
};

export function themeId(value) {
  return Object.hasOwn(documentThemes,value) ? value : 'classic';
}

export function styleFor(theme,key) {
  const preset=documentThemes[themeId(theme)],style=paragraphStyles[key];
  const title=style.level||key==='title'||key==='subtitle';
  return {
    font:title?preset.heading:preset.font,
    serif:title?preset.headingSerif||preset.serif:preset.serif,
    size:style.size?Math.round(style.size*(preset.headingScale||1)):preset.size,
    color:title?preset.accent:key==='quote'?'#475569':'#172033',
    line:title?1.25:preset.line,
    before:style.before||0,
    after:style.after??(style.level?12:preset.after),
    bold:style.bold||false,
    italic:style.italic||false
  };
}

export function paragraphStyleId(node) {
  const attribute=node.getAttribute?.('data-word-style');
  if(isStyleAttribute(node.tagName,attribute))return attribute;
  const key=node.tagName?.toLowerCase();
  return key==='blockquote'?'quote':/^h[1-4]$/.test(key)?key:'normal';
}

export function isStyleAttribute(tag,key) {
  return key==='title'||key==='subtitle' ? ['P','DIV','LI'].includes(tag) :
    tag==='LI'&&(key==='quote'||/^h[1-4]$/.test(key));
}

export function setParagraphStyle(block,key) {
  const tag=block.matches('li')?'li':paragraphStyles[key].tag;
  let styled=block;
  if(!block.matches(tag)){
    styled=document.createElement(tag);
    const cell=block.matches('td,th');
    if(!cell)for(const {name,value} of block.attributes)styled.setAttribute(name,value);
    styled.append(...block.childNodes);
    if(!styled.childNodes.length)styled.append(document.createElement('br'));
    if(cell)block.append(styled);
    else block.replaceWith(styled);
  }
  if(isStyleAttribute(styled.tagName,key))styled.dataset.wordStyle=key;
  else styled.removeAttribute('data-word-style');
  // The contents table assigns fresh bookmarks when it updates.
  if(!(paragraphStyles[key].level<=3))styled.removeAttribute('id');
  return styled;
}

export function styleFont(style) {
  return `"${style.font}", ${style.serif?'serif':'sans-serif'}`;
}

export const documentStyleCSS = Object.keys(documentThemes).map(theme=>{
  const scope=`[data-word-theme="${theme}"]`;
  const normal=styleFor(theme,'normal');
  const text=style=>`font-family:${styleFont(style)};font-size:${style.size}pt;color:${style.color};line-height:${style.line};`;
  const selectors={
    title:'[data-word-style="title"]',subtitle:'[data-word-style="subtitle"]',
    h1:'h1,[data-word-style="h1"]',h2:'h2,[data-word-style="h2"]',
    h3:'h3,[data-word-style="h3"]',h4:'h4,[data-word-style="h4"]',
    quote:'blockquote,[data-word-style="quote"]'
  };
  return `${scope}{${text(normal)}}`+
    `${scope} :is(p,div):not(:where([data-word-theme],[data-word-style],[data-word-page],[data-word-toc],[data-word-toc] *,[data-word-break],[data-word-columns])){margin-top:0;margin-bottom:${normal.after}pt}`+
    `${scope} [data-word-style] :is(ul,ol){${text(normal)}font-weight:400;font-style:normal}`+
    Object.entries(selectors).map(([key,selector])=>{
      const style=styleFor(theme,key);
      return `${scope} :is(${selector}){${text(style)}font-weight:${style.bold?700:400};font-style:${style.italic?'italic':'normal'};margin-top:${style.before}pt;margin-bottom:${style.after}pt}`;
    }).join('')+
    `${scope} blockquote{border-inline-start:3px solid ${documentThemes[theme].accent};margin-inline:0;padding-inline-start:12pt}`;
}).join('');
