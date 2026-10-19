"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ExecutiveShell } from "@/components/admin/ExecutiveShell";
import { PromotionsWorkspace } from "@/components/admin/PromotionsWorkspace";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import {
  AdminGlobalScope,
  DEFAULT_ADMIN_GLOBAL_SCOPE,
  AdminWorkspaceId,
  serializeAdminGlobalScope,
  parseAdminGlobalScope,
} from "@/lib/admin-scope";
import { Lock, ShieldAlert, Loader2 } from "lucide-react";

export default function AdminPromotionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();

  const [scope, setScope] = useState<AdminGlobalScope>(() => ({ ...parseAdminGlobalScope(searchParams?.toString() || ""), workspace: "promotions" }));
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date().toISOString());
  }, []);

  useEffect(() => {
    setScope({ ...parseAdminGlobalScope(searchParams?.toString() || ""), workspace: "promotions" });
  }, [searchParams]);

  const handleScopeChange = (newScope: AdminGlobalScope) => {
    const updated = { ...newScope, workspace: "promotions" as const };
    setScope(updated);
    const query = serializeAdminGlobalScope(updated);
    router.replace(query ? `/admin/promotions?${query}` : "/admin/promotions");
  };

  const handleWorkspaceChange = (workspace: AdminWorkspaceId) => {
    if (workspace === "promotions") return;
    const nextScope = { ...scope, workspace };
    setScope(nextScope);
    const query = serializeAdminGlobalScope(nextScope);
    const destination = ["orders", "journeys", "economics", "promotions", "growth"].includes(workspace)
      ? `/admin/${workspace}`
      : "/admin";
    router.push(query ? `${destination}?${query}` : destination);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500 mr-2" />
        Checking administrative authorization...
      </div>
    );
  }

  return (
    <AdminSessionGate>
    <ExecutiveShell
      currentWorkspace="promotions"
      scope={scope}
      onScopeChange={handleScopeChange}
      onWorkspaceChange={handleWorkspaceChange}
      onRefresh={handleRefresh}
      isLoading={false}
      lastUpdated={lastUpdated}
      userEmail={user?.email}
      onLogout={signOut}
    >
      <PromotionsWorkspace
        key={refreshKey}
        userEmail={user?.email}
        scope={scope}
        onRefresh={handleRefresh}
      />
    </ExecutiveShell>
    </AdminSessionGate>
  );
}
