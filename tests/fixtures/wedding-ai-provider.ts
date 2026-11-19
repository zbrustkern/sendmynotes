/** Synthetic, deterministic TEST ONLY adapter. Never imported by application code. */
import type { WeddingAiProvider } from '../../lib/wedding/ai-provider';
export function syntheticWeddingAiProvider(): WeddingAiProvider & {calls: {kind:string;input:unknown}[]} {
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic wedding AI requires test mode.');
  const calls: {kind:string;input:unknown}[]=[];
  return {
    info:{provider:'Synthetic test adapter',model:'deterministic-text-v1',imageModel:'deterministic-image-v1',mode:'synthetic-test',available:true},calls,
    async draft(rows,tone){calls.push({kind:'draft',input:{rows,tone}});return {suggestions:rows.map(r=>({id:r.id,text:r.gift&&!r.gift.includes('removed')?`Thank you for the ${r.gift}. Your kindness means so much to us.`:'Thank you for thinking of us. Your kindness means so much to us.'}))};},
    async map(input){calls.push({kind:'map',input});return input.headers?{mapping:Object.fromEntries(input.headers.filter(h=>h==='Gift'||h==='Name').map(h=>[h,h==='Gift'?'gift':'envelopeName']))}:{suggestions:[{name:'Noor and Kit',gift:'blue bowl',memory:''}]};},
    async image(prompt,reference){calls.push({kind:'image',input:{prompt,referenceBytes:reference?.length||0}});return Buffer.from('synthetic image adapter bytes');},
  };
}
