import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const compiled=ts.transpileModule(fs.readFileSync("components/admin/ManualFollowupPanel.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(component="ManualFollowupPanel") {
 const componentCode=component==="ManualFollowupPanel"?compiled:ts.transpileModule(fs.readFileSync(`components/admin/${component}.tsx`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const slots:any[]=[];let cursor=0;const effects:any[]=[];const requests:Array<{url:string;options:any;resolve:(v:any)=>void}>=[];
 const react={useRef:(value:any)=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},useState:(value:any)=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],(next:any)=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];},useEffect:(effect:any,deps:any[])=>{const i=cursor++;const prev=slots[i];if(!prev||deps.some((v,n)=>v!==prev.deps[n])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:effect()};});}}};
 const exports:any={};const modules:any={react:{__esModule:true,...react,default:react},"./ManualFollowupPanel":{ManualFollowupPanel:"manual-composer"},"react/jsx-runtime":{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})}};
 const context=vm.createContext({exports,module:{exports},require:(name:string)=>modules[name],AbortController,Date,console,encodeURIComponent,fetch:(url:string,options:any)=>new Promise(resolve=>requests.push({url,options,resolve}))});vm.runInContext(componentCode,context);
 return {requests,render:(orderId="",sourceType="order")=>{cursor=0;const tree=exports[component]({orderId,sourceType});while(effects.length)effects.shift()();return tree;}};
}
function nodes(tree:any):any[]{if(!tree||typeof tree!=="object")return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];}
const view=(order:string,draft=true)=>({maskedEmail:`${order}@example.invalid`,permission:"unknown",sensitiveOccasion:false,isTestOrder:false,blockers:[],senderEmail:"sender@example.invalid",replyTo:"reply@example.invalid",postalAddress:"Synthetic",draft:draft?{id:order,kind:"service",subject:`Subject ${order}`,body:`Private body ${order}`,revision:1,state:"draft"}:null});
const resolve=(r:any,data:any)=>r.resolve({ok:true,json:async()=>({data})});
async function main(){
 for(const mode of ["generate","save"]){
  const h=harness();h.render("A");resolve(h.requests.shift(),view("A",mode==="save"));await tick();let tree=h.render("A");
  if(mode==="save") {nodes(tree).find(n=>n.type==="textarea").props.onChange({target:{value:"Edited private body A"}});tree=h.render("A");}
  const label=mode==="generate"?"Generate personal note":"Save changes for review";
  nodes(tree).find(n=>n.type==="button"&&n.props.children===label).props.onClick();
  const old=h.requests.shift();assert.equal(JSON.parse(old!.options.body).orderId,"A");
  h.render("B");resolve(h.requests.shift(),view("B"));await tick();resolve(old,view("A"));await tick();tree=h.render("B");
  const text=JSON.stringify(tree);assert.ok(text.includes("Private body B"));assert.ok(!text.includes("Private body A"));assert.ok(!text.includes("Edited private body A"));
 }
 const cross=harness();cross.render("same","order");resolve(cross.requests.shift(),view("order"));await tick();let crossTree=cross.render("same","order");
 nodes(crossTree).find(n=>n.type==="textarea").props.onChange({target:{value:"Edited order body"}});crossTree=cross.render("same","order");
 nodes(crossTree).find(n=>n.type==="button"&&n.props.children==="Save changes for review").props.onClick();const oldSource=cross.requests.shift();
 cross.render("same","feedback");const nextSource=cross.requests.shift();assert.ok(nextSource!.url.includes("sourceType=feedback"));resolve(nextSource,view("feedback"));await tick();resolve(oldSource,view("order"));await tick();crossTree=cross.render("same","feedback");
 assert.ok(JSON.stringify(crossTree).includes("Private body feedback"));assert.ok(!JSON.stringify(crossTree).includes("Private body order"));
 nodes(crossTree).find(n=>n.type==="textarea").props.onChange({target:{value:"Edited feedback"}});crossTree=cross.render("same","feedback");nodes(crossTree).find(n=>n.type==="button"&&n.props.children==="Save changes for review").props.onClick();
 const sourceAction=JSON.parse(cross.requests.shift()!.options.body);assert.equal(sourceAction.sourceType,"feedback");assert.equal(sourceAction.sourceId,"same");
 const contextHarness=harness();contextHarness.render("feedback","feedback");const contextView={...view("feedback"),feedbackContext:{text:"<script>alert(1)</script>",truncated:false,category:"<img onerror=alert(1)>",rating:2}};resolve(contextHarness.requests.shift(),contextView);await tick();const contextTree=contextHarness.render("feedback","feedback");
 assert.ok(nodes(contextTree).some(n=>n.type==="p"&&n.props.children===contextView.feedbackContext.text));assert.ok(nodes(contextTree).every(n=>!n.props?.dangerouslySetInnerHTML));
 assert.ok(!nodes(contextTree).find(n=>n.type==="textarea").props.value.includes("<script>"));
 const list=harness("CapturedContactsPanel");list.render();list.requests.shift()!.resolve({ok:true,json:async()=>({items:[{id:"fb_1",createdAt:1,maskedEmail:"a••@example.invalid"}],nextCursor:"fb_1"})});await tick();let listTree=list.render();
 nodes(listTree).find(n=>n.type==="button"&&n.props.children==="Write personal email").props.onClick();listTree=list.render();
 const mounted=nodes(listTree).find(n=>n.type==="manual-composer");assert.equal(mounted.props.sourceType,"feedback");assert.equal(mounted.props.sourceId,"fb_1");
 nodes(listTree).find(n=>n.type==="button"&&n.props.children==="Next page").props.onClick();list.render();assert.ok(list.requests.shift()!.url.includes("cursor=fb_1"));
 const accountList=harness("CapturedContactsPanel");accountList.render();accountList.requests.shift()!.resolve({ok:true,json:async()=>({items:[],nextCursor:null})});await tick();let accountsTree=accountList.render();nodes(accountsTree).find(n=>n.type==="select").props.onChange({target:{value:"account"}});accountList.render();const accountsRequest=accountList.requests.shift()!;assert.ok(accountsRequest.url.includes("sourceType=account"));accountsRequest.resolve({ok:true,json:async()=>({items:[{id:"user_1",maskedEmail:"u••@example.invalid",createdAt:1}],nextCursor:null})});await tick();accountsTree=accountList.render();nodes(accountsTree).find(n=>n.type==="button"&&n.props.children==="Write personal email").props.onClick();accountsTree=accountList.render();assert.equal(nodes(accountsTree).find(n=>n.type==="manual-composer").props.sourceType,"account");
 console.log("Manual composer ignores old-order generate/save responses after switching orders.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
