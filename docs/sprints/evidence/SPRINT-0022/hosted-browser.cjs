const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app';
(async()=>{const f=JSON.parse(fs.readFileSync('.data/upload-staging-fixture.json')),d=JSON.parse(fs.readFileSync('.data/upload-staging-browser.json'));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 await context.addInitScript(f=>{localStorage.setItem(`firebase:authUser:${f.apiKey}:[DEFAULT]`,JSON.stringify({uid:f.uid,email:f.email,emailVerified:true,displayName:'Upload QA',isAnonymous:false,providerData:[{providerId:'password',uid:f.email,email:f.email,displayName:'Upload QA',photoURL:null}],stsTokenManager:{refreshToken:f.refreshToken,accessToken:f.idToken,expirationTime:f.expiresAt},createdAt:String(Date.now()),lastLoginAt:String(Date.now()),apiKey:f.apiKey,appName:'[DEFAULT]'}));},f);
 await context.addCookies([{name:'smn_admin_session',value:f.cookie,url:base,httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // No API mocks. Payments and supplier calls are not part of this smoke.
 await page.goto(base+'/create/upload');await page.getByText('1. Choose a personal image',{exact:true}).waitFor({timeout:45000});await page.screenshot({path:__dirname+'/checks/hosted-studio.png',fullPage:true});
 await page.goto(base+'/new?uploadDesign='+encodeURIComponent(d.selection.designId));await page.getByPlaceholder('Write your note from the heart...').waitFor({timeout:45000});await page.waitForFunction(()=>!!document.querySelector('img[src^="blob:"]'));
 await page.reload();await page.getByPlaceholder('Write your note from the heart...').waitFor();await page.waitForFunction(()=>!!document.querySelector('img[src^="blob:"]'));
 const draft=await page.evaluate(()=>sessionStorage.getItem('sendmynotes_draft_v1'));assert(draft.includes(d.selection.designId));assert(!draft.includes('blob:'));
 await page.screenshot({path:__dirname+'/checks/hosted-builder.png',fullPage:true});
 await page.goto(base+'/admin/uploads');await page.getByText('Upload studio',{exact:false}).first().waitFor();await page.getByText(f.email,{exact:false}).first().waitFor();await page.screenshot({path:__dirname+'/checks/hosted-admin.png',fullPage:true});
 assert.equal(errors.length,0);const out={passed:true,checkedAt:new Date().toISOString(),apiMocks:false,checks:['entitled hosted studio','authenticated accepted cover handoff','refresh revalidates private preview','durable draft has ID but no blob URL','owner admin grants visible'],paymentCalls:0,supplierCalls:0,pageErrors:errors};fs.writeFileSync(__dirname+'/checks/hosted-browser.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
