// Geometria em DIP, limites de leitura e relógio pausável, compartilhados com os testes.
(function(root){
 const defaults={wpm:200,minSeconds:5,maxSeconds:30,voice:false,closeToTray:true,opacity:.82};
 function settings(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Configuração inválida.');
  if(Object.keys(value).some(k=>!Object.hasOwn(defaults,k)))throw Error('Configuração desconhecida.');
  const result={...defaults,...value};
  if(!Number.isFinite(result.opacity)||result.opacity<.55||result.opacity>.95)throw Error('A opacidade deve ficar entre 55% e 95%.');
  if(!Number.isFinite(result.wpm)||result.wpm<80||result.wpm>600||!Number.isFinite(result.minSeconds)||result.minSeconds<3||result.minSeconds>60||!Number.isFinite(result.maxSeconds)||result.maxSeconds<result.minSeconds||result.maxSeconds>120||typeof result.voice!=='boolean'||typeof result.closeToTray!=='boolean')throw Error('Confira a velocidade (80–600) e os tempos (3–120 segundos).');
  return result;
 }
 function duration(text,config=defaults){const count=(text.trim().match(/\S+/g)||[]).length;return Math.max(config.minSeconds,Math.min(config.maxSeconds,count/config.wpm*60+3))*1000;}
 function clamp(point,area,size=56){return {x:Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-size))),y:Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-size)))};}
 function nearest(point,displays){return [...displays].sort((a,b)=>distance(point,a.workArea)-distance(point,b.workArea))[0];}
 function distance(p,a){return Math.max(a.x-p.x,0,p.x-a.x-a.width)**2+Math.max(a.y-p.y,0,p.y-a.y-a.height)**2;}
 function panels(point,area,height=260){
  const leftSpace=point.x-area.x-18,rightSpace=area.x+area.width-point.x-74;
  const width=Math.max(180,Math.min(360,area.width-16,Math.max(leftSpace,rightSpace))),inputHeight=Math.min(150,area.height-16);
  const preferred=leftSpace>=width?point.x-width-10:point.x+66;
  const x=Math.round(Math.max(area.x+8,Math.min(preferred,area.x+area.width-width-8)));
  const responseHeight=Math.max(90,Math.min(height,320,area.height-inputHeight-32));
  const y=Math.round(Math.max(area.y+responseHeight+16,Math.min(point.y-25,area.y+area.height-inputHeight-8)));
  return {input:{x,y,width,height:inputHeight},response:{x,y:y-responseHeight-8,width,height:responseHeight}};
 }
 function circle(size=56){const rows=[];for(let y=0;y<size;y++){const half=Math.sqrt(Math.max(0,(size/2)**2-(y+.5-size/2)**2)),x=Math.ceil(size/2-half);rows.push({x,y,width:size-2*x,height:1});}return rows;}
 function rounded(width,height,radius=12){const result=[];for(let y=0;y<height;y++){const dy=y<radius?radius-y-.5:y>=height-radius?y-(height-radius)+.5:0;const inset=dy?Math.ceil(radius-Math.sqrt(Math.max(0,radius*radius-dy*dy))):0;result.push({x:inset,y,width:Math.max(1,width-inset*2),height:1});}return result;}
 class Clock{
  constructor(now=()=>performance.now()){this.now=now;this.remaining=0;this.reasons=new Set();this.last=now();}
  tick(){const current=this.now();if(!this.reasons.size)this.remaining=Math.max(0,this.remaining-(current-this.last));this.last=current;return this.remaining;}
  reset(milliseconds){this.remaining=milliseconds;this.last=this.now();}
  pause(reason,yes){this.tick();if(yes)this.reasons.add(reason);else this.reasons.delete(reason);}
 }
 const api={defaults,settings,duration,clamp,nearest,panels,circle,rounded,Clock};if(typeof module!=='undefined')module.exports=api;else root.QuickCore=api;
})(globalThis);
