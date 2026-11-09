const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=__dirname;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||u.protocol==='data:'?r.continue():r.abort()});
 await page.addInitScript(()=>{if(window.top!==window)return;const now=Date.now();if(!sessionStorage.getItem('sendmynotes_draft_v1'))sessionStorage.setItem('sendmynotes_draft_v1',JSON.stringify({schemaVersion:1,createdAt:now,updatedAt:now,draftRevision:5,experienceVersion:'candidate_v1',entryContext:'general',selectedDesign:{presetId:'holiday-evergreen',imageUrl:'/presets/holiday-evergreen.jpg',title:'Holiday Evergreen',source:'preset',accepted:true},note:{salutation:'Dear Maya,',text:'Wishing you a peaceful holiday season.',signOff:'With love,\nAlex',style:'hwDavid'},recipient:{name:'Maya Ellis',addressLine1:'123 Example Lane',city:'Portland',state:'OR',zip:'97205',country:'US'},sender:{name:'Alex Morgan',addressLine1:'100 Demo Avenue',city:'Indianapolis',state:'IN',zip:'46204',country:'US'},schedule:null,discountCode:null,attribution:null,customGeneration:{status:'idle'},checkoutSnapshotId:null,checkoutContact:{email:'',choice:'omitted'},currentStep:'address'}))});
 await page.goto(process.argv[2]||'http://127.0.0.1:3110/preview/entry',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Where should we mail it?'}).waitFor({timeout:60000});await page.evaluate(()=>document.fonts.ready);


 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'+ Add another recipient',exact:true}).click();
 await page.getByText('Multiple cards need complete addresses.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Keep one recipient',exact:true}).click();
 assert(await page.getByRole('checkbox').isChecked(),'cancel conflict retains deferral');
 await page.getByRole('button',{name:'+ Add another recipient',exact:true}).click();
 await page.getByRole('button',{name:'Switch to complete addresses',exact:true}).click();
 const section=page.getByRole('region',{name:'Multiple recipients'});
 await section.getByLabel('Recipient name',{exact:true}).waitFor();
 assert.equal(await section.getByRole('heading',{name:'Recipients (1)',exact:true}).count(),1);
 await section.getByLabel('Street address',{exact:true}).fill('123 Example Lane');
 await section.getByRole('button',{name:'Save address',exact:true}).click();
 await section.getByRole('button',{name:'+ Add another recipient',exact:true}).click();
 await section.getByLabel('Recipient name',{exact:true}).fill('Lee Example');
 await section.getByLabel('Street address',{exact:true}).fill('20 Fictional Avenue');
 await section.getByLabel('City',{exact:true}).fill('Seattle');await section.locator('select').last().selectOption('WA');await section.getByLabel('ZIP Code',{exact:true}).fill('98101');
 await section.getByRole('button',{name:'Save recipient',exact:true}).click();
 await section.getByRole('heading',{name:'Recipients (2)',exact:true}).waitFor();
 await section.getByRole('button',{name:'Keep one recipient',exact:true}).click();
 assert.equal(await section.count(),0);assert.equal(await page.getByRole('checkbox').isChecked(),false,'explicitly discarded deferral does not return');
 fs.writeFileSync(path.join(output,'implemented-deferral-browser.json'),JSON.stringify({errors,checks:['conflict before validation','keep preserves deferral','switch completes first recipient','collapse does not revive discarded deferral']},null,2));assert.deepEqual(errors,[]);console.log('Deferral conflict, explicit conversion, and collapse passed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
