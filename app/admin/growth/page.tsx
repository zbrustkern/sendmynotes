"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ExecutiveShell } from "@/components/admin/ExecutiveShell";
import DecisionLogWorkspace from "@/components/admin/DecisionLogWorkspace";
import { GrowthWorkspace } from "@/components/admin/GrowthWorkspace";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import {
  AdminGlobalScope,
  AdminWorkspaceId,
  serializeAdminGlobalScope,
  parseAdminGlobalScope,
} from "@/lib/admin-scope";
import { Loader2 } from "lucide-react";

export default function AdminGrowthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();

  const [scope, setScope] = useState<AdminGlobalScope>(() => ({
    ...parseAdminGlobalScope(searchParams?.toString() || ""),
    workspace: "growth",
  }));
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    setScope({ ...parseAdminGlobalScope(searchParams?.toString() || ""), workspace: "growth" });
  }, [searchParams]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date().toISOString());
  }, []);

  const handleScopeChange = (newScope: AdminGlobalScope) => {
    const updated = { ...newScope, workspace: "growth" as const };
    setScope(updated);
    const query = serializeAdminGlobalScope(updated);
    router.replace(query ? `/admin/growth?${query}` : "/admin/growth");
  };

  const handleWorkspaceChange = (workspace: AdminWorkspaceId) => {
    if (workspace === "growth") return;
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
      currentWorkspace="growth"
      scope={scope}
      onScopeChange={handleScopeChange}
      onWorkspaceChange={handleWorkspaceChange}
      onRefresh={handleRefresh}
      isLoading={false}
      lastUpdated={lastUpdated}
      userEmail={user?.email}
      onLogout={signOut}
    >
      <GrowthWorkspace
        key={refreshKey}
        scope={scope}
        userEmail={user?.email}
        onRefresh={handleRefresh}
      />
      <DecisionLogWorkspace key={`decisions-${refreshKey}`} />
    </ExecutiveShell>
    </AdminSessionGate>
  );
}
