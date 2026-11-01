import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as opentype from 'opentype.js';
import { UploadError, UploadTreatment, UPLOAD_LIMITS } from './contracts';

export type LayoutLine = { text: string; x: number; y: number; size: number; rotate?: number };
export type TreatmentLayout = { lines: LayoutLine[]; color: string; font: string; align: 'center'; region: {x:number;y:number;width:number;height:number}; decoration: 'none'|'shadow'|'arch' };
function readFont(filename:string):opentype.Font {
  const data=readFileSync(join(process.cwd(),'lib/upload',filename));
  const exactBytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  return opentype.parse(exactBytes);
}
const fonts = { playful:readFont('fredoka.woff'), serif:readFont('dm-serif-display.woff') };
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export { escapeXml };

function splitExact(text:string):string[] {
  if(typeof text!=='string')throw new UploadError('invalid_text','Enter the words you want on the front.');
  if(text.length===0)return [];
  const normalized=text;
  const lines=normalized.split('\n');
  const count=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(normalized)).length;
  if(count>UPLOAD_LIMITS.textGraphemes||lines.length>3||(normalized.length>0&&lines.some(line=>!line.trim())))throw new UploadError('text_too_long','Use up to 40 characters on no more than three lines.');
  return lines;
}

export function getTreatmentFont(treatmentId:UploadTreatment):opentype.Font { return treatmentId==='classic-serif'?fonts.serif:fonts.playful; }
export function assertGlyphSupport(text:string,treatmentId:UploadTreatment):void {
  const font=getTreatmentFont(treatmentId);
  for(const char of Array.from(text)) {
    if(char==='\n'||char==='\r')continue;
    const glyph=font.charToGlyph(char);
    if(!glyph||glyph.index===0)throw new UploadError('unsupported_glyph','These words include characters this lettering style cannot render. Try different wording.');
  }
}

function wrapBalanced(text:string,face:opentype.Font,maxLines=3):string[] {
  const words=text.trim().split(/\s+/).filter(Boolean);
  if(words.length<=1)return [text];
  if(words.length===2)return words;
  const lineCount=Math.min(maxLines,words.length);
  let best:{score:number;lines:string[]}|undefined;
  const visit=(start:number,lines:string[])=>{
    if(lines.length===lineCount-1){
      const tail=words.slice(start).join(' ');if(!tail)return;
      const candidate=[...lines,tail];const widths=candidate.map(line=>face.getAdvanceWidth(line,1,{kerning:true}));
      const max=Math.max(...widths);const avg=widths.reduce((a,b)=>a+b,0)/widths.length;
      const score=max+widths.reduce((sum,width)=>sum+(width-avg)**2,0)/(avg||1)*0.05;
      if(!best||score<best.score)best={score,lines:candidate};
      return;
    }
    const remainingLines=lineCount-lines.length-1;
    for(let end=start+1;end<=words.length-remainingLines;end++)visit(end,[...lines,words.slice(start,end).join(' ')]);
  };
  visit(0,[]);return best?.lines||[text];
}

export function layoutTreatment(exactText:string,treatmentId:UploadTreatment):TreatmentLayout {
  let lines=splitExact(exactText); const region={x:112,y:50,width:1051,height:390};
  if(!lines.length)return {lines:[],color:'#243b35',font:'bundled',align:'center',region,decoration:'none'};
  assertGlyphSupport(exactText,treatmentId);
  const face=getTreatmentFont(treatmentId); const font=`bundled-${treatmentId==='classic-serif'?'dm-serif-display':'fredoka'}`;
  if(treatmentId==='playful-stack'&&lines.length===1&&lines[0].trim().includes(' '))lines=wrapBalanced(lines[0],face,3);
  let size=treatmentId==='classic-serif'?164:treatmentId==='gentle-arch'?156:176;
  const maxAdvance=Math.max(...lines.map(line=>face.getAdvanceWidth(line,1,{kerning:true})));
  const lineGapFactor=treatmentId==='playful-stack'?1.05:1.12;
  size=Math.min(size,Math.floor(980/Math.max(0.01,maxAdvance)),Math.floor(region.height/(lines.length*lineGapFactor)));
  if(size<38)throw new UploadError('text_does_not_fit','These words are too long for this treatment. Shorten the words or add line breaks.');
  const lineGap=Math.round(size*lineGapFactor); const blockHeight=lines.length*lineGap;
  if(blockHeight>region.height)throw new UploadError('text_does_not_fit','These words do not fit in the lettering area. Use fewer lines.');
  const baseline=region.y+(region.height-blockHeight)/2+size*0.82;
  const layouts=lines.map((line,i)=>({text:line,x:637.5,y:baseline+i*lineGap,size,rotate:treatmentId==='playful-stack'?(i%2===0?-2:2):0}));
  return {lines:layouts,color:treatmentId==='classic-serif'?'#243b35':treatmentId==='gentle-arch'?'#9b4939':'#e06b43',font,align:'center',region,decoration:treatmentId==='playful-stack'?'shadow':treatmentId==='gentle-arch'?'arch':'none'};
}

export function renderLetteringSvg(layout:TreatmentLayout):string {
  const nodes=layout.lines.map((line,i)=>{
    const face=getTreatmentFont(layout.font.includes('serif')?'classic-serif':'playful-stack');
    const width=face.getAdvanceWidth(line.text,line.size,{kerning:true});
    const textPath=face.getPath(line.text,line.x-width/2,line.y,line.size,{kerning:true}).toPathData(2);
    const paths=`<path d="${textPath}"/>`;
    const shadow=layout.decoration==='shadow'?`<g transform="translate(5 7)" fill="#f8e4c6">${paths}</g>`:'';
    if(layout.decoration==='arch'&&i===0){
      // A shallow arch made from independently positioned glyph outlines keeps every glyph a real path.
      const chars=Array.from(line.text);const scale=line.size/face.unitsPerEm;const glyphs=chars.map(char=>face.charToGlyph(char));
      const kern=chars.map((_,index)=>index?face.getKerningValue(glyphs[index-1],glyphs[index])*scale:0);
      const adv=glyphs.map((glyph,index)=>(glyph.advanceWidth||0)*scale+kern[index]);const total=adv.reduce((a,b)=>a+b,0);let x=line.x-total/2;
      const arch=chars.map((_,index)=>{x+=kern[index];const glyph=glyphs[index];const gx=x+(glyph.advanceWidth||0)*scale/2;const t=(gx-line.x)/(total/2||1);const y=line.y-85*Math.max(0,1-t*t);const path=glyph.getPath(x,y,line.size).toPathData(2);x+=(glyph.advanceWidth||0)*scale;return `<path d="${path}"/>`;}).join('');
      return `<g fill="${layout.color}">${arch}</g>`;
    }
    return `${shadow}<g fill="${layout.color}"${line.rotate?` transform="rotate(${line.rotate} ${line.x} ${line.y-line.size/2})"`:''}>${paths}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1275" height="1650" viewBox="0 0 1275 1650">${nodes}</svg>`;
}
