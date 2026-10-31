// Synthetic fixtures only. All app APIs are intercepted by individual checks.
const fs=require('node:fs');
const apiKey=fs.readFileSync('lib/firebase-client.ts','utf8').match(/PROD_FIREBASE_CONFIG = \{\s*apiKey: "([^"]+)"/)[1];
function identity(uid='menu-owner',email='owner@example.test') {
 const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const jwt=enc({alg:'none'})+'.'+enc({sub:uid,user_id:uid,email,email_verified:true,iat:now,exp:now+3600,aud:'sendmynotes-2a417',iss:'https://securetoken.google.com/sendmynotes-2a417',firebase:{sign_in_provider:'password',identities:{email:[email]}}})+'.fixture';
 return {uid,email,jwt,apiKey,now,record:{uid,email,emailVerified:true,displayName:'Synthetic Tester',isAnonymous:false,providerData:[{providerId:'password',uid:email,email}],stsTokenManager:{refreshToken:'fixture-refresh',accessToken:jwt,expirationTime:Date.now()+3600000},createdAt:String(Date.now()),lastLoginAt:String(Date.now()),apiKey,appName:'[DEFAULT]'}};
}
async function seed(context,who) {
 await context.addInitScript(({record,apiKey})=>{if(!sessionStorage.getItem('fixture-initialized')){localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`,JSON.stringify(record));sessionStorage.setItem('fixture-initialized','1');}},{record:who.record,apiKey});
}
async function firebase(context,getIdentity) {
 await context.route('**/identitytoolkit.googleapis.com/**',r=>{const w=getIdentity();return r.fulfill({json:r.request().url().includes('signInWithPassword')?{localId:w.uid,email:w.email,idToken:w.jwt,refreshToken:'fixture-refresh',expiresIn:'3600',registered:true}:{users:[{localId:w.uid,email:w.email,emailVerified:true,displayName:'Synthetic Tester',providerUserInfo:[{providerId:'password',rawId:w.email,email:w.email}],validSince:String(w.now-60),createdAt:String(Date.now())}]}})});
}
const note='Thank you for helping us settle into our new home. Your kindness made a busy week feel lighter.\n\nWe loved sharing stories around the table and look forward to another evening together soon.\n\nWith warm thanks,\nAlex and the Example family';
const address={firstName:'Sample',lastName:'Recipient',street1:'123 Example Street',street2:'',city:'Austin',state:'TX',zip:'78701',country:'US'};
const order={id:'synthetic-preview-order-with-long-identifier',status:'PAID',createdAt:Date.now(),customerEmail:'fixture@example.test',amountInCents:900,frontImageUrl:'/presets/birthday-balloons.jpg',printedMessage:'Dear Friend,',handwrittenNote:note,fontStyleId:'hwDavid',recipientAddress:address,returnAddress:{...address,firstName:'Sample',lastName:'Sender'}};
const metrics={totalRevenueCents:900,totalOrders:1,ordersByStatus:{pending:0,processing:1,failed:0},funnel:{totalSessions:1,coverSelected:1,noteCompleted:1,addressCompleted:1,checkoutInitiated:1,paid:1},recentOrders:[order]};
module.exports={identity,seed,firebase,note,order,metrics};
