"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Package,
  BookOpen,
  Plus,
  Trash2,
  Calendar,
  PenTool,
  ArrowLeft,
  Mail,
  CheckCircle2,
  Clock,
  Sparkles,
  LogOut,
  MapPin,
  ExternalLink,
  Edit2,
  BookmarkCheck,
  Feather,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Order, SavedAddress, MailingAddress } from "@/lib/types";
import { AuthModal } from "@/components/AuthModal";

export default function AccountDashboardPage() {
  const router = useRouter();
  const {
    user,
    account,
    loading: authLoading,
    signOut,
    saveAddress,
    deleteAddress,
    updateDefaultReturnAddress,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<"orders" | "addresses">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Address Modal State
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);

  // Return Address Edit State
  const [isEditingReturn, setIsEditingReturn] = useState(false);
  const [returnForm, setReturnForm] = useState<MailingAddress>({
    firstName: "",
    lastName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    country: "USA",
  });

  // Auth Modal State (if not logged in)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (account?.defaultReturnAddress) {
      setReturnForm(account.defaultReturnAddress);
    }
  }, [account]);

  // Fetch past orders for this customer
  useEffect(() => {
    if (!user) {
      setOrdersLoading(false);
      return;
    }

    const fetchOrders = async () => {
      setOrdersLoading(true);
      try {
        const res = await fetch(`/api/account?uid=${user.uid}&email=${encodeURIComponent(user.email || "")}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch (err) {
        console.error("Failed to load customer orders:", err);
      } finally {
        setOrdersLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center animate-bounce shadow-lg shadow-amber-600/25 mb-4">
          <Feather className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-serif text-stone-900 mb-2">Loading Account...</h2>
      </div>
    );
  }

  // Not Logged In View
  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 sm:p-10 rounded-3xl border border-stone-200 shadow-xl max-w-md w-full space-y-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center shadow-inner">
            <Feather className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-stone-900 mb-2">sendmynotes Account</h1>
            <p className="text-sm text-stone-500">
              Sign in to view your physical card order history, manage your recipient address book, and set milestone reminders.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full py-3 bg-stone-900 hover:bg-black text-white text-sm font-semibold rounded-2xl shadow-md transition cursor-pointer"
            >
              Sign In / Create Account
            </button>
            <Link
              href="/"
              className="inline-block text-xs font-semibold text-stone-500 hover:text-stone-800 transition"
            >
              &larr; Return to Storefront
            </Link>
          </div>
        </div>

        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 text-stone-900">
      {/* HEADER */}
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20 hover:bg-amber-700 transition"
            >
              <Feather className="w-5 h-5 text-amber-100" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg sm:text-xl font-bold text-stone-900">
                  sendmynotes
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Account
                </span>
              </div>
              <p className="text-xs text-stone-500">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Send New Card ($9.00)</span>
            </Link>

            <button
              onClick={() => signOut()}
              className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* TABS SWITCHER */}
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "orders"
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Order History</span>
            <span className="text-xs opacity-75 font-mono">({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("addresses")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "addresses"
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Address Book</span>
            <span className="text-xs opacity-75 font-mono">
              ({account?.savedAddresses.length || 0})
            </span>
          </button>
        </div>

        {/* TAB 1: ORDER HISTORY */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-serif font-bold text-stone-900">Your Physical Cards</h2>
                <p className="text-xs text-stone-500">
                  Real ballpoint ink greeting cards penned and mailed via USPS First Class.
                </p>
              </div>

              <Link
                href="/"
                className="inline-flex sm:hidden items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Card</span>
              </Link>
            </div>

            {ordersLoading ? (
              <div className="p-12 text-center text-stone-400 text-sm">Loading your orders...</div>
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-4 max-w-lg mx-auto">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                  <PenTool className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-stone-900">No cards sent yet</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Design an AI cover, compose your sentiment, and our robotic pen plotters will pen it with real ink and mail it for a flat $9.00.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-amber-700 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Create Your First Card</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {orders.map((order) => {
                  const isInking = order.status === "PROCESSING_HANDWRYTTEN";
                  const isScheduled = !!order.scheduledSendDate;

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition space-y-4"
                    >
                      <div className="flex gap-4">
                        <div className="relative w-20 aspect-[5/7] rounded-xl overflow-hidden border border-stone-200 bg-stone-100 flex-shrink-0 shadow-sm">
                          <Image
                            src={order.frontImageUrl}
                            alt="Card Cover"
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isInking
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : isScheduled
                                  ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}
                            >
                              {isInking
                                ? "Inking Active"
                                : isScheduled
                                ? "Scheduled"
                                : "Queued in Studio"}
                            </span>
                            <span className="text-[10px] font-mono text-stone-400">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-stone-900 truncate">
                            {order.recipientAddress.firstName} {order.recipientAddress.lastName}
                          </h3>
                          <p className="text-[11px] text-stone-500 truncate">
                            {order.recipientAddress.city}, {order.recipientAddress.state}
                          </p>

                          {order.scheduledSendDate && (
                            <div className="flex items-center gap-1 text-[11px] text-indigo-700 font-medium pt-1">
                              <Calendar className="w-3 h-3" />
                              <span>Send: {order.scheduledSendDate}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 bg-stone-50 rounded-xl text-xs text-stone-600 line-clamp-2 italic font-serif">
                        &ldquo;{order.printedMessage || order.handwrittenNote.slice(0, 80)}&rdquo;
                      </div>

                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                        <Link
                          href={`/order/${order.id}`}
                          className="font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1"
                        >
                          <span>Tracker</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>

                        <Link
                          href="/"
                          className="font-semibold text-stone-700 hover:text-stone-900 flex items-center gap-1 bg-stone-100 hover:bg-stone-200/80 px-2.5 py-1 rounded-lg transition"
                        >
                          <PenTool className="w-3 h-3 text-amber-600" />
                          <span>Send Again</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ADDRESS BOOK */}
        {activeTab === "addresses" && (
          <div className="space-y-8">
            {/* SAVED RECIPIENTS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-bold text-stone-900">
                    Saved Recipient Addresses
                  </h2>
                  <p className="text-xs text-stone-500">
                    Contacts appear inside the card builder for 1-click address autofill.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingAddress(null);
                    setIsAddressModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Contact</span>
                </button>
              </div>

              {!account?.savedAddresses || account.savedAddresses.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center space-y-3 max-w-md mx-auto">
                  <BookOpen className="w-8 h-8 mx-auto text-stone-400" />
                  <h3 className="text-sm font-bold text-stone-900">Your Address Book is empty</h3>
                  <p className="text-xs text-stone-500">
                    Save friends, family, or clients to autofill their addresses when writing cards.
                  </p>
                  <button
                    onClick={() => {
                      setEditingAddress(null);
                      setIsAddressModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add First Contact</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {account.savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            {addr.label || "Recipient"}
                          </span>
                          <button
                            onClick={() => deleteAddress(addr.id)}
                            className="text-stone-400 hover:text-rose-600 transition p-1"
                            title="Delete Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <h3 className="text-sm font-bold text-stone-900 pt-1">
                          {addr.firstName} {addr.lastName}
                        </h3>
                        <p className="text-xs text-stone-600">{addr.street1}</p>
                        {addr.street2 && <p className="text-xs text-stone-600">{addr.street2}</p>}
                        <p className="text-xs text-stone-600">
                          {addr.city}, {addr.state} {addr.zip}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                        <button
                          onClick={() => {
                            setEditingAddress(addr);
                            setIsAddressModalOpen(true);
                          }}
                          className="text-stone-500 hover:text-stone-800 flex items-center gap-1 text-[11px] font-medium"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <Link
                          href="/"
                          className="text-amber-700 hover:text-amber-900 font-semibold text-[11px] flex items-center gap-1"
                        >
                          <span>Send Card &rarr;</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DEFAULT RETURN ADDRESS */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div>
                  <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-stone-500" />
                    Default Return Address (Sender)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Pre-fills the top-left return corner on your greeting card envelopes.
                  </p>
                </div>

                {!isEditingReturn && (
                  <button
                    onClick={() => setIsEditingReturn(true)}
                    className="text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200 transition"
                  >
                    {account?.defaultReturnAddress ? "Edit Return Address" : "Set Return Address"}
                  </button>
                )}
              </div>

              {isEditingReturn ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await updateDefaultReturnAddress(returnForm);
                    setIsEditingReturn(false);
                  }}
                  className="space-y-4 max-w-xl"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        required
                        value={returnForm.firstName}
                        onChange={(e) =>
                          setReturnForm((prev) => ({ ...prev, firstName: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        required
                        value={returnForm.lastName}
                        onChange={(e) =>
                          setReturnForm((prev) => ({ ...prev, lastName: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      required
                      value={returnForm.street1}
                      onChange={(e) =>
                        setReturnForm((prev) => ({ ...prev, street1: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        required
                        value={returnForm.city}
                        onChange={(e) =>
                          setReturnForm((prev) => ({ ...prev, city: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={returnForm.state}
                        onChange={(e) =>
                          setReturnForm((prev) => ({
                            ...prev,
                            state: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-full px-2 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg text-center uppercase"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        required
                        value={returnForm.zip}
                        onChange={(e) =>
                          setReturnForm((prev) => ({ ...prev, zip: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2 bg-stone-900 text-white text-xs font-semibold rounded-xl hover:bg-black transition"
                    >
                      Save Return Address
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingReturn(false)}
                      className="px-4 py-2 text-xs text-stone-500 hover:text-stone-800 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : account?.defaultReturnAddress ? (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs space-y-1 max-w-md">
                  <p className="font-bold text-stone-800">
                    {account.defaultReturnAddress.firstName} {account.defaultReturnAddress.lastName}
                  </p>
                  <p className="text-stone-600">{account.defaultReturnAddress.street1}</p>
                  {account.defaultReturnAddress.street2 && (
                    <p className="text-stone-600">{account.defaultReturnAddress.street2}</p>
                  )}
                  <p className="text-stone-600">
                    {account.defaultReturnAddress.city}, {account.defaultReturnAddress.state}{" "}
                    {account.defaultReturnAddress.zip}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-400 italic">No default return address set yet.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ADD / EDIT CONTACT MODAL */}
      {isAddressModalOpen && (
        <ContactModal
          initialAddress={editingAddress}
          onClose={() => setIsAddressModalOpen(false)}
          onSave={async (savedData) => {
            await saveAddress(savedData);
            setIsAddressModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ContactModal({
  initialAddress,
  onClose,
  onSave,
}: {
  initialAddress: SavedAddress | null;
  onClose: () => void;
  onSave: (data: Omit<SavedAddress, "id"> & { id?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    id: initialAddress?.id,
    label: initialAddress?.label || "Friend",
    firstName: initialAddress?.firstName || "",
    lastName: initialAddress?.lastName || "",
    street1: initialAddress?.street1 || "",
    street2: initialAddress?.street2 || "",
    city: initialAddress?.city || "",
    state: initialAddress?.state || "",
    zip: initialAddress?.zip || "",
    country: "USA",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 className="text-base font-bold text-stone-900">
            {initialAddress ? "Edit Contact" : "Add New Contact"}
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Relationship / Label (e.g. Mom, Best Friend, Client)
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="Mom"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Street Address
            </label>
            <input
              type="text"
              required
              value={form.street1}
              onChange={(e) => setForm((p) => ({ ...p, street1: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Apt, Suite (Optional)
            </label>
            <input
              type="text"
              value={form.street2}
              onChange={(e) => setForm((p) => ({ ...p, street2: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">City</label>
              <input
                type="text"
                required
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">State</label>
              <input
                type="text"
                required
                maxLength={2}
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value.toUpperCase() }))}
                className="w-full px-2 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl text-center uppercase"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">ZIP</label>
              <input
                type="text"
                required
                value={form.zip}
                onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-stone-900 text-white text-xs font-semibold rounded-xl hover:bg-black transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Contact"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs text-stone-500 hover:text-stone-800 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
