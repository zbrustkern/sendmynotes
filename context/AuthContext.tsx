"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  saveAddress: (address: Omit<SavedAddress, "id"> & { id?: string }) => Promise<void>;
  deleteAddress: (addressId: string) => Promise<void>;
  updateDefaultReturnAddress: (address: MailingAddress) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = async (currentUser: User) => {
    try {
      const res = await fetch(`/api/account?uid=${currentUser.uid}&email=${encodeURIComponent(currentUser.email || "")}`);
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setAccount(data.user);
        } else {
          // Initialize new UserAccount record
          const initRes = await fetch("/api/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || "",
              savedAddresses: [],
            }),
          });
          if (initRes.ok) {
            const initData = await initRes.json();
            setAccount(initData.user);
          }
        }
      }
    } catch (err) {
      console.warn("[Auth] Failed to load user account:", err);
    }
  };

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          await fetchAccount(currentUser);
        } else {
          setAccount(null);
        }
        setLoading(false);
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

  const signOut = async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    setUser(null);
    setAccount(null);
  };

  const refreshAccount = async () => {
    if (user) {
      await fetchAccount(user);
    }
  };

  const saveAddress = async (address: Omit<SavedAddress, "id"> & { id?: string }) => {
    if (!user) return;

    const addressId = address.id || `addr_${Date.now()}`;
    const newAddress: SavedAddress = {
      ...address,
      id: addressId,
    };

    const currentAddresses = account?.savedAddresses || [];
    const existingIndex = currentAddresses.findIndex((a) => a.id === addressId);
    let updatedAddresses: SavedAddress[];

    if (existingIndex >= 0) {
      updatedAddresses = [...currentAddresses];
      updatedAddresses[existingIndex] = newAddress;
    } else {
      updatedAddresses = [...currentAddresses, newAddress];
    }

    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || account?.email || "",
        displayName: account?.displayName || user.displayName || "",
        addressToAdd: newAddress,
        savedAddresses: updatedAddresses,
        defaultReturnAddress: account?.defaultReturnAddress,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setAccount(data.user);
      }
    }
  };

  const deleteAddress = async (addressId: string) => {
    if (!user) return;

    const currentAddresses = account?.savedAddresses || [];
    const updatedAddresses = currentAddresses.filter((a) => a.id !== addressId);
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || account?.email || "",
        displayName: account?.displayName || user.displayName || "",
        savedAddresses: updatedAddresses,
        defaultReturnAddress: account?.defaultReturnAddress,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setAccount(data.user);
      }
    }
  };

  const updateDefaultReturnAddress = async (address: MailingAddress) => {
    if (!user) return;

    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || account?.email || "",
        displayName: account?.displayName || user.displayName || "",
        savedAddresses: account?.savedAddresses || [],
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
        signOut,
        refreshAccount,
        saveAddress,
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
