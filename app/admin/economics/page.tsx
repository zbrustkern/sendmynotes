"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ExecutiveShell } from "@/components/admin/ExecutiveShell";
import { EconomicsInvestigationWorkspace } from "@/components/admin/EconomicsInvestigationWorkspace";
import { StudioCompModal } from "@/components/admin/StudioCompModal";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import {
  AdminGlobalScope,
  parseAdminGlobalScope,
  serializeAdminGlobalScope,
} from "@/lib/admin-scope";
import { useAuth } from "@/context/AuthContext";

export default function AdminEconomicsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [scope, setScope] = useState<AdminGlobalScope>(() => {
    const parsed = parseAdminGlobalScope(searchParams?.toString() || "");
    return { ...parsed, workspace: "economics" };
  });

  const [showCompModal, setShowCompModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (searchParams) {
      const parsed = parseAdminGlobalScope(searchParams.toString());
      setScope((prev) => ({ ...prev, ...parsed, workspace: "economics" }));
    }
  }, [searchParams]);

  const handleScopeChange = (newScope: AdminGlobalScope) => {
    const updated = { ...newScope, workspace: "economics" as const };
    setScope(updated);
    if (typeof window !== "undefined") {
      const q = serializeAdminGlobalScope(updated);
      window.history.pushState(null, "", `/admin/economics${q ? `?${q}` : ""}`);
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
        currentWorkspace="economics"
        scope={scope}
        onScopeChange={handleScopeChange}
        onWorkspaceChange={handleWorkspaceChange}
        onRefresh={() => setRefreshKey((key) => key + 1)}
        isLoading={false}
        userEmail={user?.email || null}
        onTriggerComp={() => setShowCompModal(true)}
      >
        <EconomicsInvestigationWorkspace
          key={refreshKey}
          scope={scope}
          onScopeChange={handleScopeChange}
        />
      </ExecutiveShell>

      {showCompModal && (
        <StudioCompModal
          onClose={() => setShowCompModal(false)}
          onSuccess={() => {}}
        />
      )}
    </>
    </AdminSessionGate>
  );
}
