import type {NextRequest} from 'next/server';
import {cronAuthorized} from '@/lib/cron-auth';
import {cleanupWeddingDrafts,cleanupWeddingSourceRecords,cleanupWeddingDraftArtwork} from '@/lib/wedding/retention';
import {assertWeddingRuntime,weddingErrorResponse,weddingJson} from '@/lib/wedding/server';
export const runtime='nodejs';
export async function POST(req:NextRequest){if(!cronAuthorized(req,'UPLOAD_CLEANUP_SECRET'))return weddingJson({error:'Cleanup authorization is required.'},401);try{assertWeddingRuntime();return weddingJson({drafts:await cleanupWeddingDrafts(),sources:await cleanupWeddingSourceRecords(),artwork:await cleanupWeddingDraftArtwork()});}catch(error){return weddingErrorResponse(error);}}
