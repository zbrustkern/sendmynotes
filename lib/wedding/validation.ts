import { weddingArtworkPreset } from './artwork-policy';
import { ALL_FONT_CANDIDATES } from '../card-presets';
import { normalizeCountryCode } from '../mailing-destinations';
import { blankWeddingAddress, type WeddingAddress, type WeddingHousehold, type WeddingProject, type WeddingTemplate } from './domain';
import { canonicalWeddingJSON } from './hash';
import { WeddingError, weddingId } from './server';
export function object(value: unknown): Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new WeddingError('invalid_fields','Check the submitted fields.');return value as Record<string,unknown>;}
export function keys(value:Record<string,unknown>,allowed:readonly string[]) {for(const k of Object.keys(value))if(!allowed.includes(k))throw new WeddingError('forbidden_field',`The ${k.slice(0,40)} field cannot be changed.`,400);}
export function text(value:unknown,max=2000):string {if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new WeddingError('invalid_text',`Use text of at most ${max} characters.`);return value;}
export function boolean(value:unknown):boolean {if(typeof value!=='boolean')throw new WeddingError('invalid_boolean','Choose yes or no.');return value;}
export function version(value:unknown):number {if(!Number.isSafeInteger(value)||Number(value)<1)throw new WeddingError('revision_required','Reload the latest version before saving.',409);return Number(value);}
export function matchVersion(actual:number,expected:unknown) {if(actual!==version(expected))throw new WeddingError('revision_conflict','This item changed on another device. Reload before saving.',409);}
export function address(value:unknown):WeddingAddress {
  const a=object(value);keys(a,Object.keys(blankWeddingAddress()));const result=blankWeddingAddress();
  for(const k of Object.keys(result) as (keyof WeddingAddress)[]) result[k]=text(a[k]??'',k==='address1'||k==='address2'?300:100);
  const country=normalizeCountryCode(result.country);result.country=country||'';return result;
}
export function householdPatch(row:WeddingHousehold,value:unknown,project:WeddingProject):WeddingHousehold {
  const patch=object(value);keys(patch,['envelopeName','firstName','lastName','insideName','greeting','gift','memory','address','addressConfirmed','bodyOverride','signOffOverride','templateId','excluded','insideNameConfirmed','identityConfirmed','greetingNeedsReview']);
  const next={...row};
  for(const k of ['envelopeName','firstName','lastName','insideName','gift','memory'] as const)if(k in patch)next[k]=text(patch[k],['gift','memory'].includes(k)?4000:300);
  for(const k of ['greeting','bodyOverride','signOffOverride'] as const)if(k in patch)next[k]=patch[k]===null?null:text(patch[k],k==='bodyOverride'?16000:2000);
  for(const k of ['addressConfirmed','excluded','insideNameConfirmed','identityConfirmed','greetingNeedsReview'] as const)if(k in patch)next[k]=boolean(patch[k]);
  if('insideName' in patch && !('insideNameConfirmed' in patch))next.insideNameConfirmed=!!next.insideName.trim();
  if(('firstName' in patch||'envelopeName' in patch)&&!('identityConfirmed' in patch))next.identityConfirmed=!!next.firstName.trim()&&!!next.envelopeName.trim();
  if('greeting' in patch)next.greetingNeedsReview=false;
  if('templateId' in patch){next.templateId=patch.templateId===null?null:weddingId(patch.templateId);if(next.templateId&&!project.templates.some(t=>t.id===next.templateId))throw new WeddingError('template_missing','Choose an existing template.');}
  if('address' in patch){next.address=address(patch.address);if(canonicalWeddingJSON(next.address)!==canonicalWeddingJSON(row.address)){next.addressRevision=row.addressRevision+1;next.addressConfirmed=patch.addressConfirmed===true;next.addressEvidence=next.addressConfirmed?'sender_confirmed':'unreviewed';}}
  if('addressConfirmed' in patch)next.addressEvidence=next.addressConfirmed?'sender_confirmed':'unreviewed';
  return next;
}
export function projectPatch(project:WeddingProject,value:unknown):WeddingProject {
  const patch=object(value);keys(patch,['sharedBody','signOff','handwriting','cover','returnAddress','templates','writingMode']);
  const next={...project};
  for(const k of ['sharedBody','signOff'] as const)if(k in patch)next[k]=text(patch[k],k==='sharedBody'?16000:2000);
  if('writingMode' in patch){if(patch.writingMode!=='shared'&&patch.writingMode!=='individual')throw new WeddingError('invalid_mode','Choose a writing mode.');next.writingMode=patch.writingMode;}
  if('handwriting' in patch){const font=text(patch.handwriting,80);if(!ALL_FONT_CANDIDATES.some(f=>f.id===font))throw new WeddingError('invalid_handwriting','Choose a supported handwriting.');next.handwriting=font;}
  if('returnAddress' in patch){const a=object(patch.returnAddress);keys(a,[...Object.keys(blankWeddingAddress()),'firstName','lastName']);const {firstName,lastName,...postal}=a;next.returnAddress={...address(postal),firstName:text(firstName??'',300),lastName:text(lastName??'',300)};if(next.returnAddress.country&&next.returnAddress.country!=='US')throw new WeddingError('sender_country','Use a personal United States return address.');}
  if('cover' in patch){const cover=object(patch.cover);keys(cover,['kind','id','url']);const id=weddingId(cover.id);if(cover.kind==='preset'){const preset=weddingArtworkPreset(id);if(!preset)throw new WeddingError('invalid_cover','Choose an available cover.');next.cover={kind:'preset',id,url:preset};}else if(cover.kind==='upload'){next.cover={kind:'upload',id,url:`/api/wedding/artwork?id=${encodeURIComponent(id)}`};}else throw new WeddingError('invalid_cover','Choose a cover.');}
  if('templates' in patch){if(!Array.isArray(patch.templates)||patch.templates.length>4)throw new WeddingError('template_limit','Use up to four templates.');const templates:WeddingTemplate[]=patch.templates.map(v=>{const t=object(v);keys(t,['id','name','body','signOff','revision']);const id=weddingId(t.id),old=project.templates.find(x=>x.id===id);const template={id,name:text(t.name,80),body:text(t.body,16000),signOff:text(t.signOff??'',2000),revision:old?.revision||1};if(!template.name.trim())throw new WeddingError('template_name','Give the template a name.');if(old&&(old.name!==template.name||old.body!==template.body||old.signOff!==template.signOff))template.revision++;return template;});if(new Set(templates.map(t=>t.id)).size!==templates.length)throw new WeddingError('duplicate_template','Use different template IDs.');next.templates=templates;}
  return next;
}
