"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { classifyUploadStudioAccess, UploadStudioAccessState } from "@/lib/upload/access-state";

export type { UploadStudioAccessState } from "@/lib/upload/access-state";

export function useUploadStudioAccess(user: User | null, authLoading: boolean) {
  const [snapshot, setSnapshot] = useState<{ uid: string | null; state: UploadStudioAccessState }>({ uid: null, state: "resolving" });
  const requestSequence = useRef(0);
  const uid = user?.uid ?? null;
  const currentUid = useRef(uid);
  currentUid.current = uid;
  const state = authLoading ? "resolving" : snapshot.uid === uid ? snapshot.state : user ? "checking" : "inactive";
  const publish = useCallback((forUid: string | null, next: UploadStudioAccessState) => {
    if (currentUid.current === forUid) setSnapshot({ uid: forUid, state: next });
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const requestUid = user?.uid ?? null;
    if (authLoading) { publish(requestUid, "resolving"); return; }
    if (!user) { publish(null, "inactive"); return; }
    publish(requestUid, "checking");
    if (!user.emailVerified) { publish(requestUid, "inactive"); return; }
    try {
      const token = await user.getIdToken();
      if (requestUid !== currentUid.current) return;
      const response = await fetch("/api/upload/access", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        if (sequence === requestSequence.current && requestUid === currentUid.current) publish(requestUid, "inactive");
        return;
      }
      if (!response.ok) {
        if (sequence === requestSequence.current && requestUid === currentUid.current) publish(requestUid, classifyUploadStudioAccess({ emailVerified: true, status: response.status, allowed: false }));
        return;
      }
      const data = await response.json();
      if (sequence === requestSequence.current && requestUid === currentUid.current) publish(requestUid, classifyUploadStudioAccess({ emailVerified: true, status: response.status, allowed: data?.allowed }));
    } catch {
      if (sequence === requestSequence.current && requestUid === currentUid.current) publish(requestUid, "error");
    }
  }, [user, authLoading, publish]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    publish(uid, authLoading ? "resolving" : user ? "checking" : "inactive");
    if (!authLoading && user) void refresh();
    const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      requestSequence.current = Math.max(requestSequence.current, sequence) + 1;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [uid, authLoading, refresh]);

  return { state, refresh };
}
