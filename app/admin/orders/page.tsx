"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ExecutiveShell } from "@/components/admin/ExecutiveShell";
import { OrdersInvestigationWorkspace } from "@/components/admin/OrdersInvestigationWorkspace";
import { ProofInspectorModal } from "@/components/admin/ProofInspectorModal";
import { AddressRetryModal } from "@/components/admin/AddressRetryModal";
import { StudioCompModal } from "@/components/admin/StudioCompModal";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import {
  AdminGlobalScope,
  DEFAULT_ADMIN_GLOBAL_SCOPE,
  parseAdminGlobalScope,
  serializeAdminGlobalScope,
} from "@/lib/admin-scope";
import { useAuth } from "@/context/AuthContext";

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [scope, setScope] = useState<AdminGlobalScope>(() => {
    const parsed = parseAdminGlobalScope(searchParams?.toString() || "");
    return { ...parsed, workspace: "orders" };
  });

  const [selectedProofOrderId, setSelectedProofOrderId] = useState<string | null>(null);
  const [selectedAddressRetryOrder, setSelectedAddressRetryOrder] = useState<any | null>(null);
  const [showCompModal, setShowCompModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (searchParams) {
      const parsed = parseAdminGlobalScope(searchParams.toString());
      setScope((prev) => ({ ...prev, ...parsed, workspace: "orders" }));
    }
  }, [searchParams]);

  const handleScopeChange = (newScope: AdminGlobalScope) => {
    const updated = { ...newScope, workspace: "orders" as const };
    setScope(updated);
    if (typeof window !== "undefined") {
      const q = serializeAdminGlobalScope(updated);
      window.history.pushState(null, "", `/admin/orders${q ? `?${q}` : ""}`);
    }
  };

  const handleWorkspaceChange = (workspace: import("@/lib/admin-scope").AdminWorkspaceId) => {
    const nextScope = { ...scope, workspace };
    const query = serializeAdminGlobalScope(nextScope);
    const destination = ["orders", "journeys", "economics", "promotions", "growth"].includes(workspace)
      ? `/admin/${workspace}`
      : "/admin";
    router.push(query ? `${destination}?${query}` : destination);
  };

  return (
    <AdminSessionGate>
    <>
      <ExecutiveShell
        currentWorkspace="orders"
        scope={scope}
        onScopeChange={handleScopeChange}
        onWorkspaceChange={handleWorkspaceChange}
        onRefresh={() => setRefreshKey((key) => key + 1)}
        isLoading={false}
        userEmail={user?.email || null}
        onTriggerComp={() => setShowCompModal(true)}
      >
        <Link href={`/admin?${serializeAdminGlobalScope({ ...scope, workspace: "orders" })}`} className="inline-flex text-xs underline text-stone-600 hover:text-stone-950">
          Open legacy order sync and dispatch tools
        </Link>
        <OrdersInvestigationWorkspace
          key={refreshKey}
          scope={scope}
          onScopeChange={handleScopeChange}
          onInspectProof={(id) => setSelectedProofOrderId(id)}
          onRetryAddress={(ord) => setSelectedAddressRetryOrder(ord)}
        />
      </ExecutiveShell>

      {selectedProofOrderId && (
        <ProofInspectorModal
          orderId={selectedProofOrderId}
          onClose={() => setSelectedProofOrderId(null)}
        />
      )}

      {selectedAddressRetryOrder && (
        <AddressRetryModal
          order={selectedAddressRetryOrder}
          onClose={() => setSelectedAddressRetryOrder(null)}
          onSuccess={() => setRefreshKey((key) => key + 1)}
        />
      )}

      {showCompModal && (
        <StudioCompModal
          onClose={() => setShowCompModal(false)}
          onSuccess={() => setRefreshKey((key) => key + 1)}
        />
      )}
    </>
    </AdminSessionGate>
  );
}
