import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateReferenceImage } from '../lib/upload/provider';
import { layoutTreatment, renderLetteringSvg } from '../lib/upload/treatments';

async function main(){
  const layout=layoutTreatment('Thank You','playful-stack');
  assert.equal(layout.lines.length,2,'Playful Stack should arrange Thank You as a large two-line headline');
  assert.ok(layout.lines.every(line=>line.size>=150),'headline remains prominent');
  const phrase='Thank you for being there';const phraseLayout=layoutTreatment(phrase,'playful-stack');
  assert.equal(phraseLayout.lines.length,3,'longer phrases wrap into three balanced lines');
  assert.equal(phraseLayout.lines.map(line=>line.text).join(' '),phrase);
  assert.deepEqual(layoutTreatment('','playful-stack').lines,[],'blank exact text keeps an illustration-only cover');
  assert.match(renderLetteringSvg(layout),/<path d="M/,'text is flattened from glyph outlines, not an SVG font dependency');
  const base=await sharp({create:{width:1275,height:1650,channels:3,background:'#e9eee8'}}).png().toBuffer();
  const composed=await sharp(base).composite([{input:Buffer.from(renderLetteringSvg(layout))}]).png().toBuffer();
  const meta=await sharp(composed).metadata();assert.equal(meta.width,1275);assert.equal(meta.height,1650);
  assert.throws(()=>layoutTreatment('A word far too long for this carefully bounded lettering layout','classic-serif'),(error:any)=>error?.code==='text_too_long'||error?.code==='text_does_not_fit');
  assert.throws(()=>layoutTreatment('Thanks 🌿','gentle-arch'),(error:any)=>error?.code==='unsupported_glyph');
  const priorFetch=global.fetch;const priorKey=process.env.GEMINI_API_KEY;const priorModel=process.env.UPLOAD_IMAGE_MODEL;
  let capturedUrl='';let captured:any;
  let providerCalls=0;
  process.env.GEMINI_API_KEY='test-key';process.env.UPLOAD_IMAGE_MODEL='gemini-nano-banana-2.1';
  global.fetch=(async (input:any,init:any)=>{providerCalls++;capturedUrl=String(input);captured=JSON.parse(init.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('provider-image').toString('base64')}}]}}]}),{status:200});}) as typeof fetch;
  try{
    const result=await generateReferenceImage({prompt:'locked standards and reserved type region',referencePng:Buffer.from('reference-png')});
    assert.ok(capturedUrl.includes('/v1beta/models/gemini-nano-banana-2.1:generateContent'));
    const parts=captured.contents[0].parts;assert.equal(parts[1].inlineData.mimeType,'image/png');assert.equal(Buffer.from(parts[1].inlineData.data,'base64').toString(),'reference-png');
    assert.deepEqual(captured.generationConfig.responseModalities,['TEXT','IMAGE']);assert.equal(captured.generationConfig.imageConfig.imageSize,'2K');assert.equal(result.png.toString(),'provider-image');
    global.fetch=(async()=>{providerCalls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'only text'}]}}]}),{status:200});}) as typeof fetch;
    providerCalls=0;await assert.rejects(()=>generateReferenceImage({prompt:'prompt',referencePng:Buffer.from('reference-png')}),(error:any)=>error?.code==='provider_no_image');assert.equal(providerCalls,1,'provider refusal does not trigger a text-only or source-image fallback');
    global.fetch=(async()=>new Response('provider unavailable',{status:500})) as typeof fetch;
    await assert.rejects(()=>generateReferenceImage({prompt:'prompt',referencePng:Buffer.from('reference-png')}),(error:any)=>error?.code==='provider_outcome_unknown');
    global.fetch=(async()=>new Response('{broken',{status:200})) as typeof fetch;
    await assert.rejects(()=>generateReferenceImage({prompt:'prompt',referencePng:Buffer.from('reference-png')}),(error:any)=>error?.code==='provider_invalid_response');
    global.fetch=(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'!!!!'}}]}}]}),{status:200})) as typeof fetch;
    await assert.rejects(()=>generateReferenceImage({prompt:'prompt',referencePng:Buffer.from('reference-png')}),(error:any)=>error?.code==='provider_invalid_response');
    global.fetch=(async()=>new Response('{}',{status:200,headers:{'content-length':String(32*1024*1024+1)}})) as typeof fetch;
    await assert.rejects(()=>generateReferenceImage({prompt:'prompt',referencePng:Buffer.from('reference-png')}),(error:any)=>error?.code==='provider_response_too_large');
  } finally {global.fetch=priorFetch;if(priorKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=priorKey;if(priorModel===undefined)delete process.env.UPLOAD_IMAGE_MODEL;else process.env.UPLOAD_IMAGE_MODEL=priorModel;}
  console.log('upload creative tests passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
