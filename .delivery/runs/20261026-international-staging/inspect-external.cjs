const fs=require('node:fs');
const path=require('node:path');
const base='/Users/zeke/.nvm/versions/node/v20.12.1/lib/node_modules/firebase-tools/lib/';
const out=path.join(__dirname,'checks'); fs.mkdirSync(out,{recursive:true});
(async()=>{
 if(process.argv[2]==='countries'){
  const env=fs.readFileSync('/Users/zeke/code/sendmynotes/.env.local','utf8');
  const line=env.split(/\r?\n/).find(s=>/^HANDWRYTTEN_API_KEY\s*=/.test(s));
  if(!line)throw new Error('Supplier credential unavailable');
  const key=line.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'');
  const response=await fetch('https://api.handwrytten.com/v2/countries/list',{headers:{Authorization:key,Accept:'application/json'}});
  if(!response.ok)throw new Error('Country lookup HTTP '+response.status);
  const data=await response.json();
  const entries=Array.isArray(data.countries)?data.countries:Object.values(data.countries||{});
  const selected=entries.filter(c=>/^(united states|canada|united kingdom|australia)$/i.test(c.name||''));
  const result={checkedAt:new Date().toISOString(),endpoint:'/v2/countries/list',countries:entries.map(c=>({id:c.id,name:c.name,delivery_cost:c.delivery_cost,aliases:c.aliases,states:c.states})),totalCountries:entries.length,limits:'Country catalog delivery costs do not establish full custom A2 order charge.'};
  fs.writeFileSync(path.join(out,'supplier-countries.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checkedAt:result.checkedAt,totalCountries:entries.length,rates:entries.reduce((a,c)=>{const k=String(c.delivery_cost);(a[k] ||= []).push(c.name);return a},{}),candidateSummary:selected.map(c=>({id:c.id,name:c.name,delivery_cost:c.delivery_cost}))}));return;
 }
 const project='sendmynotes-staging',backend='sendmynotes-staging';
 const account=require(base+'auth').getGlobalDefaultAccount();
 await require(base+'requireAuth').requireAuth({...account,project,projectId:project,nonInteractive:true});
 const ah=require(base+'gcp/apphosting');
 const backendInfo=await ah.getBackend(project,'us-central1',backend);
 const rolls=(await ah.listRollouts(project,'us-central1',backend)).rollouts||[];rolls.sort((a,b)=>(b.createTime||'').localeCompare(a.createTime||''));
 const build=await ah.getBuild(project,'us-central1',backend,rolls[0].build.split('/').pop());
 const {Client}=require(base+'apiv2');const api=new Client({urlPrefix:'https://run.googleapis.com',auth:true,apiVersion:'v2'});
 const service=(await api.get(`projects/${project}/locations/us-central1/services/${backend}`)).body;
 const env=service.template?.containers?.[0]?.env||[];
 const safe={checkedAt:new Date().toISOString(),project,backend,rolloutPolicy:backendInfo.codebase?.repository || backendInfo.codebase || backendInfo.appHostingEnvironment,environment:backendInfo.environment,rollout:{name:rolls[0].name,state:rolls[0].state,build:rolls[0].build},build:{name:build.name,state:build.state,source:build.source},uri:service.uri,trafficStatuses:service.trafficStatuses,guards:env.filter(v=>['STAGING_REVIEW_ONLY','NEXT_PUBLIC_STAGING_REVIEW_ONLY','HANDWRYTTEN_TEST_MODE','FIREBASE_PROJECT_ID','NEXT_PUBLIC_FIREBASE_PROJECT_ID','INTERNATIONAL_MAILING_PREVIEW'].includes(v.name)),secretValuesLogged:false};
 fs.writeFileSync(path.join(out,process.argv[2]==='after'?'staging-after.json':'staging-before.json'),JSON.stringify(safe,null,2));console.log(JSON.stringify({checkedAt:safe.checkedAt,rollout:safe.rollout,build:safe.build,state:safe.trafficStatuses.filter(t=>t.percent),guards:safe.guards,rolloutPolicy:safe.rolloutPolicy,environment:safe.environment}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
