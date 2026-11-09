import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const compiled=ts.transpileModule(fs.readFileSync("components/admin/ManualFollowupPanel.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness() {
 const slots:any[]=[];let cursor=0;const effects:any[]=[];const requests:Array<{url:string;options:any;resolve:(v:any)=>void}>=[];
 const react={useRef:(value:any)=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},useState:(value:any)=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],(next:any)=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];},useEffect:(effect:any,deps:any[])=>{const i=cursor++;const prev=slots[i];if(!prev||deps.some((v,n)=>v!==prev.deps[n])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:effect()};});}}};
 const exports:any={};const modules:any={react:{__esModule:true,...react,default:react},"react/jsx-runtime":{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})}};
 const context=vm.createContext({exports,module:{exports},require:(name:string)=>modules[name],AbortController,Date,console,encodeURIComponent,fetch:(url:string,options:any)=>new Promise(resolve=>requests.push({url,options,resolve}))});vm.runInContext(compiled,context);
 return {requests,render:(orderId:string)=>{cursor=0;const tree=exports.ManualFollowupPanel({orderId});while(effects.length)effects.shift()();return tree;}};
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
 console.log("Manual composer ignores old-order generate/save responses after switching orders.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
