import { Suspense } from "react";
import { UploadStudio } from "@/components/upload/UploadStudio";

export const metadata = { title: "Make a card front | SendMyNotes", robots: { index: false, follow: false } };

export default function UploadStudioPage() {
  return <Suspense fallback={<main className="mx-auto min-h-[60vh] max-w-6xl p-6" aria-busy="true"><p className="text-sm text-stone-600">Opening the card studio…</p></main>}><UploadStudio /></Suspense>;
}
