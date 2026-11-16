export const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export const address=(r,c)=>column(c)+(r+1);
export function position(ref){const m=/^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(ref);if(!m)throw Error('#REF!');return [+m[2]-1,[...m[1].toUpperCase()].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1];}
export function translate(formula,dr,dc){return formula.replace(/("(?:[^"]|"")*")|(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)/gi,(all,text,ac,c,ar,r)=>{if(text)return text;const [row,col]=position(c+r),nr=row+(ar?0:dr),nc=col+(ac?0:dc);return nr<0||nc<0?'#REF!':ac+column(nc)+ar+(nr+1);});}
const numeric=v=>{if(typeof v==='number')return v;if(v===''||v==null)return 0;const n=Number(v);if(!Number.isFinite(n))throw Error('#VALUE!');return n;};
// Restricted expression parser: no eval, executable JavaScript or network functions.
export function calculator(sheet){
  const cache=new Map(),visiting=new Set();let depth=0;
  function value(key){
    key=key.replaceAll('$','').toUpperCase();if(cache.has(key))return cache.get(key);if(visiting.has(key)||depth>100)throw Error('#CYCLE!');
    const [r,c]=position(key);if(r>=sheet.rows||c>=sheet.cols)throw Error('#REF!');const raw=String(sheet.cells[key]?.value||'');
    if(!raw.startsWith('=')){const v=raw!==''&&Number.isFinite(Number(raw.replace(',','.')))?Number(raw.replace(',','.')):raw.startsWith("'")?raw.slice(1):raw;cache.set(key,v);return v;}
    visiting.add(key);depth++;try{const result=parse(raw.slice(1));if(typeof result==='number'&&!Number.isFinite(result))throw Error('#NUM!');cache.set(key,result);return result;}finally{visiting.delete(key);depth--;}
  }
  function parse(source){
    let i=0;const tokens=source.match(/"(?:[^"]|"")*"|\$?[A-Za-z]+\$?\d+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[A-Za-z_]+|>=|<=|<>|[+\-*/^%=<>():;,]/g)||[];
    if(tokens.join('')!==source.replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g,''))throw Error('#FORMULA!');
    const peek=()=>tokens[i],take=()=>tokens[i++],expect=s=>{if(take()!==s)throw Error('#FORMULA!');};
    function atom(){let t=take();if(!t)throw Error('#FORMULA!');let node;
      if(t==='('){node=expression();expect(')');}
      else if(t==='+'||t==='-'){const a=atom();node=()=>numeric(a())*(t==='-'?-1:1);}
      else if(t[0]==='"')node=()=>t.slice(1,-1).replaceAll('""','"');
      else if(/^\d/.test(t))node=()=>Number(t);
      else if(/^\$?[A-Z]+\$?\d+$/i.test(t)){if(peek()===':'){take();const end=take(),[r,c]=position(t),[er,ec]=position(end);if((Math.abs(er-r)+1)*(Math.abs(ec-c)+1)>10000)throw Error('#RANGE!');node=()=>{const a=[];for(let y=Math.min(r,er);y<=Math.max(r,er);y++)for(let x=Math.min(c,ec);x<=Math.max(c,ec);x++)a.push(value(address(y,x)));return a;};}else node=()=>value(t);}
      else if(/^(TRUE|FALSE)$/i.test(t))node=()=>t.toUpperCase()==='TRUE';
      else{const fn=t.toUpperCase(),args=[];expect('(');if(peek()!==')'){do{args.push(expression());if(![',',';'].includes(peek()))break;take();}while(true);}expect(')');node=()=>{if(fn==='IF'){if(args.length!==3)throw Error('#ARGS!');return args[0]()?args[1]():args[2]();}const values=args.flatMap(a=>a()).filter(v=>typeof v==='number');if(!['SUM','AVERAGE','MIN','MAX','COUNT'].includes(fn))throw Error('#NAME?');if(!args.length)throw Error('#ARGS!');return fn==='COUNT'?values.length:fn==='SUM'?values.reduce((a,b)=>a+b,0):fn==='AVERAGE'?(values.length?values.reduce((a,b)=>a+b,0)/values.length:(()=>{throw Error('#DIV/0!');})()):fn==='MIN'?Math.min(...(values.length?values:[0])):Math.max(...(values.length?values:[0]));};}
      if(peek()==='%'){take();const prev=node;node=()=>numeric(prev())/100;}return node;
    }
    const precedence={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'+':2,'-':2,'*':3,'/':3,'^':4};
    function expression(min=0){let left=atom();while(precedence[peek()]>=min){const op=take(),p=precedence[op],right=expression(op==='^'?p:p+1),prev=left;left=()=>{const a=prev(),b=right();if(Array.isArray(a)||Array.isArray(b))throw Error('#VALUE!');if(op==='=')return a===b;if(op==='<>')return a!==b;if(op==='<')return a<b;if(op==='>')return a>b;if(op==='<=')return a<=b;if(op==='>=')return a>=b;const x=numeric(a),y=numeric(b);if(op==='/'){if(y===0)throw Error('#DIV/0!');return x/y;}return op==='+'?x+y:op==='-'?x-y:op==='*'?x*y:x**y;};}return left;}
    const result=expression();if(i!==tokens.length)throw Error('#FORMULA!');const v=result();if(Array.isArray(v))throw Error('#VALUE!');return v;
  }
  return key=>{try{return value(key);}catch(e){return e.message.startsWith('#')?e.message:'#FORMULA!';}};
}
