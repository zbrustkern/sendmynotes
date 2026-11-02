import { NextRequest } from 'next/server';
import { accountError, accountJson, expectedVersion, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { deleteOccasion, getOccasion, updateOccasion } from '@/lib/account/occasions';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req);const {migrateLegacyPeople}=await import('@/lib/account/migration');await migrateLegacyPeople(actor);const {id}=await params;const data=await getOccasion(actor,id);if(!data)return Response.json({error:'Date not found.',code:'not_found'},{status:404,headers:{'Cache-Control':'private, no-store'}});return accountJson(data);}catch(e){return accountError(e);}}
export async function PATCH(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req,true);const {id}=await params;const body=await readAccountBody(req);return accountJson(await updateOccasion(actor,id,body,expectedVersion(body.expectedVersion)));}catch(e){return accountError(e);}}
export async function DELETE(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req,true);const {id}=await params;const body=await readAccountBody(req);await deleteOccasion(actor,id,expectedVersion(body.expectedVersion));return accountJson({deleted:true});}catch(e){return accountError(e);}}
