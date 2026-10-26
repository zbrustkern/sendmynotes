"use client";

import Link from "next/link";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import { AdminMeasurementPanel } from "@/components/admin/AdminMeasurementPanel";

/** Stage-only adapter: leaves the staged executive workspaces and their guards intact. */
export default function AdminMeasurementPreviewPage() {
  return (
    <AdminSessionGate>
      <main className="mx-auto min-h-screen max-w-7xl space-y-6 bg-stone-50 p-3 sm:p-6">
        <Link href="/admin" className="inline-flex min-h-10 items-center text-sm font-semibold underline">Back to staged admin workspaces</Link>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Staging measurement preview. This report uses the period and channel controls below. Only synthetic reporting reconciliation is permitted here. The other staged workspaces remain separate and are not the source of these payment totals.</p>
        <AdminMeasurementPanel />
      </main>
    </AdminSessionGate>
  );
}
