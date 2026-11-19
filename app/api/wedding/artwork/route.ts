import {requireWeddingActor} from '@/lib/wedding/server';
import {createWeddingArtworkHandlers} from '@/lib/wedding/artwork-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const handlers=createWeddingArtworkHandlers(requireWeddingActor);
export const POST=handlers.POST;
export const GET=handlers.GET;
