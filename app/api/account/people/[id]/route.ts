import { NextRequest } from 'next/server';
import { accountError, accountJson, expectedVersion, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { deleteContact, getContact, updateContact } from '@/lib/account/people';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req);const {migrateLegacyPeople}=await import('@/lib/account/migration');await migrateLegacyPeople(actor);const {id}=await params;const data=await getContact(actor,id);if(!data)return Response.json({error:'Person not found.',code:'not_found'},{status:404,headers:{'Cache-Control':'private, no-store'}});return accountJson(data);}catch(e){return accountError(e);}}
export async function PATCH(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req,true);const {id}=await params;const body=await readAccountBody(req);const data=await updateContact(actor,id,body,expectedVersion(body.expectedVersion));return accountJson(data);}catch(e){return accountError(e);}}
export async function DELETE(req:NextRequest,{params}:Context){try{const actor=await requireAccountActor(req,true);const {id}=await params;const body=await readAccountBody(req);await deleteContact(actor,id,expectedVersion(body.expectedVersion));return accountJson({deleted:true});}catch(e){return accountError(e);}}
