"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  reload,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { UserAccount, SavedAddress, MailingAddress } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  account: UserAccount | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  sendVerificationEmail: (returnTo?: string) => Promise<void>;
  reloadUserAndRefreshToken: () => Promise<User>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  saveAddress: (address: Omit<SavedAddress, "id"> & { id?: string }) => Promise<void>;
  saveAddressesBulk: (addresses: (Omit<SavedAddress, "id"> & { id?: string })[]) => Promise<void>;
  deleteAddress: (addressId: string) => Promise<void>;
  updateDefaultReturnAddress: (address: MailingAddress) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setAuthRevision] = useState(0);
  const accountRequestSequence = useRef(0);

  const fetchAccount = useCallback(async (currentUser: User, sequence: number) => {
    const isCurrent = () => {
      try { return sequence === accountRequestSequence.current && getFirebaseAuth().currentUser?.uid === currentUser.uid; }
      catch { return false; }
    };
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch(
        `/api/account?uid=${currentUser.uid}&email=${encodeURIComponent(currentUser.email || "")}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      if (!isCurrent()) return;
      if (res.ok) {
        const data = await res.json();
        if (!isCurrent()) return;
        if (data.user) {
          setAccount(data.user);
        } else {
          // Initialize new UserAccount record
          const initRes = await fetch("/api/account", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || "",
            }),
          });
          if (!isCurrent()) return;
          if (initRes.ok) {
            const initData = await initRes.json();
            if (isCurrent()) setAccount(initData.user);
          }
        }
      }
    } catch (err) {
      console.warn("[Auth] Failed to load user account:", err);
    }
  }, []);

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        const sequence = ++accountRequestSequence.current;
        setUser(currentUser);
        setAccount(null);
        if (currentUser) {
          await fetchAccount(currentUser, sequence);
        }
        if (sequence === accountRequestSequence.current) setLoading(false);
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn("[Auth] Firebase Auth initialization notice:", err);
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    const auth = getFirebaseAuth();
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const sendVerificationEmail = useCallback(async (returnTo?: string) => {
    const current = getFirebaseAuth().currentUser;
    if (!current) throw new Error("Sign in before requesting a verification email.");
    if (current.emailVerified) return;
    const { safeVerificationReturnTo } = await import("@/lib/account/verification");
    const destination = safeVerificationReturnTo(returnTo, window.location.origin);
    const actionUrl = new URL("/account/verify", window.location.origin);
    actionUrl.searchParams.set("returnTo", destination);
    try {
      await sendEmailVerification(current, { url: actionUrl.toString(), handleCodeInApp: true });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/too-many-requests") throw new Error("Too many requests. Wait a little before trying again.");
      if (code === "auth/invalid-continue-uri" || code === "auth/unauthorized-continue-uri") throw new Error("Verification return link is not available on this domain.");
      throw new Error("The verification email could not be sent. Your account is still saved; try again shortly.");
    }
  }, []);

  const reloadUserAndRefreshToken = useCallback(async (): Promise<User> => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) throw new Error("Sign in again to refresh your account.");
    const uid = current.uid;
    await reload(current);
    if (auth.currentUser?.uid !== uid) throw new Error("Your signed-in account changed. Sign in again to continue.");
    const refreshed = auth.currentUser;
    if (!refreshed) throw new Error("Sign in again to refresh your account.");
    await refreshed.getIdToken(true);
    // Firebase mutates UserImpl in place. Bump context identity so consumers
    // observe the refreshed emailVerified flag even when the UID is unchanged.
    setUser(refreshed);
    setAuthRevision((value) => value + 1);
    await fetchAccount(refreshed, ++accountRequestSequence.current);
    return refreshed;
  }, [fetchAccount]);

  const signOut = async () => {
    let response: Response;
    try {
      response = await fetch("/api/admin/auth", { method: "DELETE", cache: "no-store" });
    } catch {
      throw new Error("Could not clear the administrator session. Your current sender account is still signed in.");
    }
    if (!response.ok) throw new Error("Could not clear the administrator session. Your current sender account is still signed in.");
    const auth = getFirebaseAuth();
    try {
      await firebaseSignOut(auth);
    } catch {
      throw new Error("The administrator session ended, but your sender account is still signed in. Please retry sign out.");
    }
    accountRequestSequence.current += 1;
    setUser(null);
    setAccount(null);
  };

  const refreshAccount = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (current) {
      await fetchAccount(current, ++accountRequestSequence.current);
    }
  }, [fetchAccount]);

  const accountApi = async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error("Sign in to update your account.");
    const token = await user.getIdToken();
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Your account could not be updated.");
    return payload as T;
  };

  const contactPayload = (address: Omit<SavedAddress, "id"> & { id?: string }) => ({
    displayName: address.label || `${address.firstName} ${address.lastName}`.trim(), relationship: "", notes: "",
    address: { firstName: address.firstName, lastName: address.lastName, street1: address.street1, street2: address.street2 || "", city: address.city, state: address.state, zip: address.zip, country: address.country || "US" },
  });

  const saveAddress = async (address: Omit<SavedAddress, "id"> & { id?: string }) => {
    if (!user) return;
    const payload = contactPayload(address);
    let contactId = address.id;
    if (contactId && account?.savedAddresses?.some((saved) => saved.id === contactId)) {
      const current = await accountApi<{ data: { version: number } }>(`/api/account/people/${encodeURIComponent(contactId)}`);
      await accountApi(`/api/account/people/${encodeURIComponent(contactId)}`, "PATCH", { ...payload, expectedVersion: current.data.version });
    } else {
      const created = await accountApi<{ data: { id: string } }>("/api/account/people", "POST", payload);
      contactId = created.data.id;
    }
    if (address.occasionMonth && address.occasionDay && contactId) {
      const list = await accountApi<{ data: Array<{ id: string; contactId: string; version: number }> }>("/api/account/occasions?limit=50");
      const current = list.data.find((event) => event.contactId === contactId);
      const event = { contactId, title: address.occasionTitle || `${address.firstName}'s ${address.occasionType || "date"}`, type: address.occasionType || "other", month: Number(address.occasionMonth), day: Number(address.occasionDay), ...(address.occasionYear ? { year: Number(address.occasionYear) } : {}), recurrence: "annual", reminderEnabled: false };
      if (current) await accountApi(`/api/account/occasions/${encodeURIComponent(current.id)}`, "PATCH", { ...event, expectedVersion: current.version });
      else await accountApi("/api/account/occasions", "POST", event);
    }
    await refreshAccount();
  };

  const saveAddressesBulk = async (addressesToImport: (Omit<SavedAddress, "id"> & { id?: string })[]) => {
    if (!user) return;
    const rows = addressesToImport.map((item) => ({ ...contactPayload(item), ...(item.occasionMonth && item.occasionDay ? { occasion: { title: item.occasionTitle || `${item.firstName}'s ${item.occasionType || "date"}`, type: item.occasionType || "other", month: Number(item.occasionMonth), day: Number(item.occasionDay), ...(item.occasionYear ? { year: Number(item.occasionYear) } : {}) } } : {}) }));
    await accountApi("/api/account/people/import", "POST", { rows });
    await refreshAccount();
  };

  const deleteAddress = async (addressId: string) => {
    if (!user) return;
    const current = await accountApi<{ data: { version: number } }>(`/api/account/people/${encodeURIComponent(addressId)}`);
    await accountApi(`/api/account/people/${encodeURIComponent(addressId)}`, "DELETE", { expectedVersion: current.data.version });
    await refreshAccount();
  };

  const updateDefaultReturnAddress = async (address: MailingAddress) => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const res = await fetch("/api/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || account?.email || "",
        displayName: account?.displayName || user.displayName || "",
        defaultReturnAddress: address,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setAccount(data.user);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendVerificationEmail,
        reloadUserAndRefreshToken,
        signOut,
        refreshAccount,
        saveAddress,
        saveAddressesBulk,
        deleteAddress,
        updateDefaultReturnAddress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
