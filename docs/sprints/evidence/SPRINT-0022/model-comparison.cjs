const cp=require('node:child_process'),fs=require('node:fs'),sharp=require('sharp'),crypto=require('node:crypto');
async function main(){
 const output=__dirname+'/checks/model-comparison';fs.mkdirSync(output,{recursive:true});
 const source=await sharp(Buffer.from('<svg width="1024" height="1325" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1325" fill="#f6edda"/><path d="M0 1000 Q180 820 390 980 T1024 950 V1325 H0Z" fill="#91a579"/><rect x="310" y="610" width="400" height="380" fill="#b65b3d"/><path d="M250 610L510 370L770 610Z" fill="#374c44"/><rect x="450" y="790" width="120" height="200" fill="#d8b57d"/><rect x="360" y="670" width="90" height="90" fill="#abc1c1"/><rect x="580" y="670" width="90" height="90" fill="#abc1c1"/><path d="M50 1050Q220 830 280 990 M750 980Q830 800 980 1030" fill="none" stroke="#375e40" stroke-width="35"/><circle cx="150" cy="900" r="45" fill="#e3b049"/><circle cx="860" cy="900" r="40" fill="#ce715b"/></svg>')).png().toBuffer();
 fs.writeFileSync(output+'/synthetic-reference.png',source);
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const secretResponse=await fetch('https://secretmanager.googleapis.com/v1/projects/sendmynotes-staging/secrets/gemini-api-key/versions/latest:access',{headers:{Authorization:`Bearer ${token}`}});if(!secretResponse.ok)throw Error('secret access '+secretResponse.status);const secret=await secretResponse.json();const key=Buffer.from(secret.payload.data,'base64').toString();
 const prompt='Use the supplied image as a visual reference for a premium personal greeting card front. Preserve the red cottage, dark green roof, two blue windows and friendly garden composition. Transform into confident hand-painted gouache with warm paper texture and simplified painterly details. Flat print artwork only, no physical card mockup, borders, shadows, watermarks, logos or text. Portrait aspect 17:22. Reserve the upper 30 percent as quiet warm cream negative space for exact lettering added later. Keep the cottage entirely below that region. No writing or lettering anywhere. Warm, thoughtful and editorial, rich forest greens and terracotta. Deliver one finished illustration.';
 const results=[];
 for(const model of ['gemini-nano-banana-2.1','gemini-3-pro-image']){
  const out=output+'/'+model+'.json';if(fs.existsSync(out)){results.push(JSON.parse(fs.readFileSync(out)));continue;}
  const started=Date.now();const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/png',data:source.toString('base64')}}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'3:4',imageSize:'2K'}}}),signal:AbortSignal.timeout(180000)});
  const data=await res.json();const image=data.candidates?.flatMap(c=>c.content?.parts||[]).find(p=>p.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
  const report={model,status:res.status,elapsedMs:Date.now()-started,requestReferenceSha256:crypto.createHash('sha256').update(source).digest('hex'),referenceAttached:true,usageMetadata:data.usageMetadata||null,finishReasons:data.candidates?.map(c=>c.finishReason),imageReturned:!!image,error:!res.ok?data.error?.message:undefined,secretValuesLogged:false};
  if(image){const bytes=Buffer.from(image.data,'base64');fs.writeFileSync(output+'/'+model+'.png',bytes);const md=await sharp(bytes).metadata();report.width=md.width;report.height=md.height;report.bytes=bytes.length;}
  fs.writeFileSync(out,JSON.stringify(report,null,2));results.push(report);console.log(JSON.stringify(report));
 }
 fs.writeFileSync(output+'/summary.json',JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
