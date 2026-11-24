"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Heart,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  SkipForward,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import type {
  ActiveDiscountOption,
  FollowupInboxData,
  IncompleteCheckoutItem,
  PaidFollowupItem,
} from "@/lib/post-purchase/followup-inbox";
import { CapturedContactsPanel } from "./CapturedContactsPanel";
import { PostPurchaseSettingsPanel } from "./PostPurchaseSettingsPanel";

type SubView = "paid" | "incomplete" | "other";
type TemplateKey = "checkin" | "checkin_discount" | "incomplete_help" | "incomplete_discount";

function formatShortDate(timestamp: number | null): string {
  if (!timestamp) return "Date unknown";
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRelativeDays(timestamp: number | null): string {
  if (!timestamp) return "";
  const diffDays = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function formatDateWithRelative(timestamp: number | null): string {
  if (!timestamp) return "Date unknown";
  const rel = formatRelativeDays(timestamp);
  return rel ? `${formatShortDate(timestamp)} (${rel})` : formatShortDate(timestamp);
}

function formatDiscountLabel(discount: ActiveDiscountOption): string {
  if (discount.type === "FIXED_AMOUNT") {
    const dollars = discount.value / 100;
    return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)} off`;
  }
  return `${discount.value}% off`;
}

const DISCOUNT_PLACEHOLDER =
  "As a small thank-you, I'd love to share a discount code for your next card—just let me know if you'd like one!";

function buildDiscountParagraph(code: string, label?: string): string {
  return `As a small thank-you, here's ${label || "a thank-you discount"} on your next card with code ${code}:\nhttps://sendmynotes.com/new?discount=${encodeURIComponent(code)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStarterTemplate(
  template: TemplateKey,
  context: { firstName: string; discountCode?: string; discountLabel?: string }
): { subject: string; body: string } {
  const greeting = context.firstName ? `Hi ${context.firstName},` : "Hi there,";
  const code = context.discountCode || "";
  const discountParagraph = code
    ? buildDiscountParagraph(code, context.discountLabel)
    : DISCOUNT_PLACEHOLDER;

  switch (template) {
    case "checkin":
      return {
        subject: "Quick check-in from Zeke at SendMyNotes",
        body: [
          greeting,
          "I'm Zeke, the founder of SendMyNotes. Thanks so much for giving us a try!",
          "Since we're still very early, I'm personally checking in to see how the experience felt—did everything go smoothly, or was there anything that felt clunky or confusing?",
          "Just hit reply—it comes straight to me.",
          "Thanks,\nZeke\nSendMyNotes",
        ].join("\n\n"),
      };
    case "checkin_discount":
      return {
        subject: "Thanks for trying SendMyNotes (plus a little thank-you)",
        body: [
          greeting,
          "I'm Zeke, the founder of SendMyNotes. Thanks so much for trying us out!",
          "I'd love to hear how sending your card went—and if anything felt harder than it should have, I read every reply.",
          discountParagraph,
          "Thanks again,\nZeke\nSendMyNotes",
        ].join("\n\n"),
      };
    case "incomplete_help":
      return {
        subject: "Did anything trip you up on SendMyNotes?",
        body: [
          greeting,
          "I'm Zeke, the founder of SendMyNotes. I noticed you started putting a card together recently and didn't end up finishing.",
          "No pressure at all—I'm just checking whether anything broke or felt confusing so I can fix it. You can reply directly to this email if you ran into a snag.",
          "Best,\nZeke\nSendMyNotes",
        ].join("\n\n"),
      };
    case "incomplete_discount":
      return {
        subject: "Quick note from Zeke at SendMyNotes",
        body: [
          greeting,
          "I'm Zeke, the founder of SendMyNotes. I noticed you started a card recently and wanted to check if anything got in the way.",
          discountParagraph,
          "If anything felt confusing, just hit reply—I'd really appreciate the feedback.",
          "Best,\nZeke\nSendMyNotes",
        ].join("\n\n"),
      };
  }
}

interface ComposerTarget {
  kind: "paid" | "incomplete";
  orderId: string;
  email: string;
  firstName: string;
  occasion: string;
  isSensitiveOccasion: boolean;
  isTestOrder: boolean;
}

export function FollowupsWorkspace({ onDiscountCreated }: { onDiscountCreated?: () => void }) {
  const [subView, setSubView] = useState<SubView>("paid");
  const [includeTests, setIncludeTests] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [data, setData] = useState<FollowupInboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // Composer state
  const [target, setTarget] = useState<ComposerTarget | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [mintOption, setMintOption] = useState<"200_FIXED" | "100_FIXED" | "20_PCT" | "15_PCT">("200_FIXED");
  const [minting, setMinting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState("");
  const loadRequestIdRef = useRef(0);

  const loadInbox = useCallback(async (testsFlag = includeTests) => {
    const reqId = ++loadRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/followup-inbox?includeTests=${testsFlag ? "true" : "false"}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (reqId !== loadRequestIdRef.current) return;
      if (!res.ok || !json?.data) throw new Error(json?.error || "Could not load follow-ups.");
      setData(json.data);
    } catch (err) {
      if (reqId !== loadRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load follow-ups.");
    } finally {
      if (reqId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [includeTests]);

  useEffect(() => {
    void loadInbox(includeTests);
  }, [includeTests, loadInbox]);

  const openComposer = (nextTarget: ComposerTarget) => {
    setTarget(nextTarget);
    setComposerError("");
    setConfirmingSend(false);
    setShowPreview(false);
    setSelectedCode("");
    const starter = buildStarterTemplate(
      nextTarget.kind === "paid" ? "checkin" : "incomplete_help",
      { firstName: nextTarget.firstName }
    );
    setSubject(starter.subject);
    setBody(starter.body);
  };

  const applyTemplate = (template: TemplateKey, overrideCode?: string, overrideLabel?: string) => {
    if (!target) return;
    const code = overrideCode ?? selectedCode;
    const discountObj = data?.activeDiscounts.find((d) => d.code === code);
    const label = overrideLabel ?? (discountObj ? formatDiscountLabel(discountObj) : undefined);
    const starter = buildStarterTemplate(template, {
      firstName: target.firstName,
      discountCode: code || undefined,
      discountLabel: label,
    });
    setSubject(starter.subject);
    setBody(starter.body);
    setConfirmingSend(false);
  };

  const insertDiscountIntoBody = (code: string, label?: string, previousCode?: string) => {
    const paragraph = buildDiscountParagraph(code, label);
    setConfirmingSend(false);
    setBody((prev) => {
      if (prev.includes(code)) return prev;
      if (prev.includes(DISCOUNT_PLACEHOLDER)) {
        return prev.replace(DISCOUNT_PLACEHOLDER, paragraph);
      }
      if (previousCode) {
        const prevPattern = new RegExp(
          `As a small thank-you, here's [^\\n]+ with code ${escapeRegExp(previousCode)}:\\nhttps://sendmynotes\\.com/new\\?discount=[^\\s]+`
        );
        if (prevPattern.test(prev)) {
          return prev.replace(prevPattern, paragraph);
        }
      }
      // Insert right before sign-off if possible, otherwise append.
      const signoffIdx = prev.lastIndexOf("\n\nThanks");
      const bestIdx = prev.lastIndexOf("\n\nBest");
      const splitIdx = Math.max(signoffIdx, bestIdx);
      if (splitIdx > 0) {
        return `${prev.slice(0, splitIdx)}\n\n${paragraph}${prev.slice(splitIdx)}`;
      }
      return `${prev.trimEnd()}\n\n${paragraph}`;
    });
  };

  const handleSelectExistingCode = (code: string) => {
    const previousCode = selectedCode;
    setSelectedCode(code);
    setConfirmingSend(false);
    if (!code) return;
    const discountObj = data?.activeDiscounts.find((d) => d.code === code);
    insertDiscountIntoBody(code, discountObj ? formatDiscountLabel(discountObj) : undefined, previousCode);
  };

  const handleMintSingleUseCode = async () => {
    if (!target) return;
    const previousCode = selectedCode;
    setMinting(true);
    setComposerError("");
    try {
      const configMap = {
        "200_FIXED": { type: "FIXED_AMOUNT", value: 200 },
        "100_FIXED": { type: "FIXED_AMOUNT", value: 100 },
        "20_PCT": { type: "PERCENTAGE", value: 20 },
        "15_PCT": { type: "PERCENTAGE", value: 15 },
      } as const;
      const spec = configMap[mintOption];
      const res = await fetch("/api/admin/followup-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mint_code",
          type: spec.type,
          value: spec.value,
          validDays: 60,
          orderId: target.orderId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.code) throw new Error(json?.error || "Could not create discount code.");
      const created = json.data as ActiveDiscountOption;
      setSelectedCode(created.code);
      setData((prev) =>
        prev ? { ...prev, activeDiscounts: [created, ...prev.activeDiscounts] } : prev
      );
      insertDiscountIntoBody(created.code, formatDiscountLabel(created), previousCode);
      onDiscountCreated?.();
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Could not create discount code.");
    } finally {
      setMinting(false);
    }
  };

  const handleSend = async () => {
    if (!target) return;
    setSending(true);
    setComposerError("");
    try {
      const res = await fetch("/api/admin/followup-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_quick",
          orderId: target.orderId,
          subject,
          body,
          discountCode: selectedCode || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not send email.");
      setToast(`Sent to ${target.email}`);
      setTarget(null);
      setConfirmingSend(false);
      await loadInbox(includeTests);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Could not send email.");
      setConfirmingSend(false);
    } finally {
      setSending(false);
    }
  };

  const handleSkip = async (orderId: string, reason = "Skipped by founder") => {
    setBusyOrderId(orderId);
    setError("");
    setToast("");
    try {
      const res = await fetch("/api/admin/followup-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", orderId, reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not skip order.");
      if (target?.orderId === orderId) setTarget(null);
      await loadInbox(includeTests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip order.");
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleUnskip = async (orderId: string) => {
    setBusyOrderId(orderId);
    setError("");
    setToast("");
    try {
      const res = await fetch("/api/admin/followup-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unskip", orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not restore order.");
      await loadInbox(includeTests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore order.");
    } finally {
      setBusyOrderId(null);
    }
  };

  const paidNeeds = data?.paidOrders.filter((o) => o.followupStatus === "needs_followup") || [];
  const paidDone = data?.paidOrders.filter((o) => ["sent", "uncertain", "skipped", "suppressed"].includes(o.followupStatus)) || [];
  const paidSympathy = data?.paidOrders.filter((o) => o.followupStatus === "auto_skipped_sympathy") || [];

  const incompleteNeeds = data?.incompleteCheckouts.filter((c) => c.followupStatus === "needs_followup") || [];
  const incompleteDone = data?.incompleteCheckouts.filter((c) => ["sent", "uncertain", "skipped", "suppressed"].includes(c.followupStatus)) || [];
  const incompleteSympathy = data?.incompleteCheckouts.filter((c) => c.followupStatus === "auto_skipped_sympathy") || [];

  const readiness = data?.readiness;

  const renderComposer = (rowOrderId: string) => {
    if (!target || target.orderId !== rowOrderId) return null;
    const isPaid = target.kind === "paid";

    return (
      <div className="mt-3 rounded-2xl border border-stone-300 bg-stone-50/90 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-stone-900">
              Email to <span className="font-mono">{target.email}</span>
            </p>
            <p className="text-xs text-stone-500">
              From Zeke at SendMyNotes &lt;{readiness?.senderEmail || "zeke@sendmynotes.com"}&gt; · replies come straight to you
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTarget(null)}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-white transition cursor-pointer"
            aria-label="Close composer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {target.isSensitiveOccasion && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>This looks like a sympathy or loss card—double-check whether you want to follow up at all.</span>
          </div>
        )}

        {/* Template selector pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Template:</span>
          {isPaid ? (
            <>
              <button
                type="button"
                onClick={() => applyTemplate("checkin")}
                className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-medium text-stone-800 cursor-pointer"
              >
                Simple check-in
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("checkin_discount")}
                className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-medium text-stone-800 cursor-pointer"
              >
                Check-in + thank-you code
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => applyTemplate("incomplete_help")}
                className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-medium text-stone-800 cursor-pointer"
              >
                Quick help check-in
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("incomplete_discount")}
                className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-medium text-stone-800 cursor-pointer"
              >
                Help + discount code
              </button>
            </>
          )}
        </div>

        {/* Optional discount code picker + 1-use mint */}
        <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800">
            <Tag className="w-3.5 h-3.5 text-amber-700" />
            <span>Optional discount code</span>
            {selectedCode && (
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span>Attached: {selectedCode}</span>
                <button
                  type="button"
                  onClick={() => handleSelectExistingCode("")}
                  aria-label="Detach discount code"
                  className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2">
              <select
                value={selectedCode}
                onChange={(e) => handleSelectExistingCode(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800"
                aria-label="Pick an existing discount code"
              >
                <option value="">Pick an existing code…</option>
                {(data?.activeDiscounts || []).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} ({formatDiscountLabel(d)}{d.maxUses === 1 ? " · 1-use" : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={mintOption}
                onChange={(e) => setMintOption(e.target.value as typeof mintOption)}
                className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800"
                aria-label="New single-use discount value"
              >
                <option value="200_FIXED">$2 off (1-use, 60d)</option>
                <option value="100_FIXED">$1 off (1-use, 60d)</option>
                <option value="20_PCT">20% off (1-use, 60d)</option>
                <option value="15_PCT">15% off (1-use, 60d)</option>
              </select>
              <button
                type="button"
                disabled={minting}
                onClick={() => void handleMintSingleUseCode()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-950 transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                {minting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Create 1-use code</span>
              </button>
            </div>
          </div>
          {selectedCode && readiness && !readiness.hasPostalAddress && (
            <p className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Heads up: US CAN-SPAM requires a business or PO box mailing address in promotional emails. Set{" "}
              <code className="font-mono">POST_PURCHASE_BUSINESS_POSTAL_ADDRESS</code> before sending discount offers.
            </p>
          )}
        </div>

        {/* Subject & Message */}
        <div className="space-y-3">
          <div>
            <label htmlFor={`followup-subject-${rowOrderId}`} className="block text-xs font-semibold text-stone-700 mb-1">
              Subject
            </label>
            <input
              id={`followup-subject-${rowOrderId}`}
              type="text"
              value={subject}
              maxLength={160}
              onChange={(e) => {
                setSubject(e.target.value);
                setConfirmingSend(false);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>
          <div>
            <label htmlFor={`followup-body-${rowOrderId}`} className="block text-xs font-semibold text-stone-700 mb-1">
              Message
            </label>
            <textarea
              id={`followup-body-${rowOrderId}`}
              value={body}
              rows={8}
              maxLength={5000}
              onChange={(e) => {
                setBody(e.target.value);
                setConfirmingSend(false);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>
        </div>

        {/* Optional Preview */}
        {showPreview && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5 text-sm">
            <p className="text-xs text-stone-500">
              <strong>From:</strong> Zeke at SendMyNotes &lt;{readiness?.senderEmail || "zeke@sendmynotes.com"}&gt;
              <br />
              <strong>To:</strong> {target.email}
              <br />
              <strong>Subject:</strong> {subject}
            </p>
            <hr className="border-stone-100" />
            <div className="whitespace-pre-wrap text-stone-800 leading-relaxed">{body}</div>
            <hr className="border-stone-100" />
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Sent personally by Zeke at SendMyNotes.
              <br />
              Stop optional follow-ups (automatic one-click link)
              {readiness?.postalAddress ? (
                <>
                  <br />
                  SendMyNotes · {readiness.postalAddress}
                </>
              ) : null}
            </p>
          </div>
        )}

        {composerError && (
          <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
            {composerError}
          </p>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? "Hide preview" : "Preview"}</span>
          </button>

          <div className="flex items-center gap-2">
            {confirmingSend ? (
              <>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setConfirmingSend(false)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending || !readiness?.canSendLive}
                  onClick={() => void handleSend()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer disabled:opacity-40"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{sending ? "Sending…" : `Confirm send to ${target.email}`}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={sending || !subject.trim() || !body.trim() || !readiness?.canSendLive}
                onClick={() => setConfirmingSend(true)}
                title={!readiness?.canSendLive ? readiness?.blockers.join(" ") : undefined}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-black px-4 py-2 text-xs font-semibold text-white transition cursor-pointer disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send email</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPaidRow = (item: PaidFollowupItem, showRestore = false) => {
    const isComposing = target?.orderId === item.orderId;
    const isBusy = busyOrderId === item.orderId;

    return (
      <article key={item.orderId} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {item.frontImageUrl ? (
              <div className="relative w-10 h-14 rounded-lg overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
                <Image src={item.frontImageUrl} alt="Card cover" fill sizes="40px" unoptimized className="object-cover" />
              </div>
            ) : (
              <div className="w-10 h-14 rounded-lg border border-stone-200 bg-stone-100 shrink-0 flex items-center justify-center text-stone-400">
                <Mail className="w-4 h-4" />
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {item.senderName || item.email}
                </p>
                {item.senderName && (
                  <span className="text-xs font-mono text-stone-500 truncate">{item.email}</span>
                )}
                {item.optInState === "opted_in" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Opted in
                  </span>
                )}
                {item.isTestOrder && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900">
                    Test / Founder
                  </span>
                )}
                {item.isSensitiveOccasion && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                    Sympathy
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-600">
                <span className="font-medium text-stone-800">{item.occasion}</span>
                {item.recipientFirstName ? ` → ${item.recipientFirstName}` : ""}
                {" · "}
                {item.mailedAt
                  ? `Mailed ${formatDateWithRelative(item.mailedAt)}`
                  : `Ordered ${formatDateWithRelative(item.createdAt)}`}
                {" · "}
                ${(item.amountInCents / 100).toFixed(2)}
              </p>

              {item.followupStatus === "sent" && (
                <p className="text-xs text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Sent {formatShortDate(item.sentAt)}
                    {item.discountCodeUsed ? ` · Code ${item.discountCodeUsed}` : ""}
                    {item.deliveryOutcome ? ` · ${item.deliveryOutcome}` : ""}
                  </span>
                </p>
              )}
              {item.followupStatus === "uncertain" && (
                <p className="text-xs text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Delivery uncertain — check Resend before retrying</span>
                </p>
              )}
              {item.followupStatus === "suppressed" && (
                <p className="text-xs text-rose-700">Do not contact ({item.optInState})</p>
              )}
              {item.followupStatus === "skipped" && (
                <p className="text-xs text-stone-500">
                  Skipped {formatShortDate(item.skippedAt)}
                  {item.skipReason && item.skipReason !== "Skipped by founder" ? ` · ${item.skipReason}` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.followupStatus === "needs_followup" && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSkip(item.orderId)}
                  className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition cursor-pointer disabled:opacity-40"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Skip</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isComposing
                      ? setTarget(null)
                      : openComposer({
                          kind: "paid",
                          orderId: item.orderId,
                          email: item.email,
                          firstName: item.senderFirstName,
                          occasion: item.occasion,
                          isSensitiveOccasion: item.isSensitiveOccasion,
                          isTestOrder: item.isTestOrder,
                        })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-black px-3.5 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{isComposing ? "Close" : "Write note"}</span>
                </button>
              </>
            )}

            {showRestore && item.followupStatus === "skipped" && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleUnskip(item.orderId)}
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
            )}

            {item.followupStatus === "auto_skipped_sympathy" && (
              <button
                type="button"
                onClick={() =>
                  isComposing
                    ? setTarget(null)
                    : openComposer({
                        kind: "paid",
                        orderId: item.orderId,
                        email: item.email,
                        firstName: item.senderFirstName,
                        occasion: item.occasion,
                        isSensitiveOccasion: true,
                        isTestOrder: item.isTestOrder,
                      })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition cursor-pointer"
              >
                <span>{isComposing ? "Close" : "Override & write"}</span>
              </button>
            )}
          </div>
        </div>

        {renderComposer(item.orderId)}
      </article>
    );
  };

  const renderIncompleteRow = (item: IncompleteCheckoutItem, showRestore = false) => {
    const isComposing = target?.orderId === item.latestOrderId;
    const isBusy = busyOrderId === item.latestOrderId;

    return (
      <article key={item.email} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {item.frontImageUrl ? (
              <div className="relative w-10 h-14 rounded-lg overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
                <Image src={item.frontImageUrl} alt="Card cover" fill sizes="40px" unoptimized className="object-cover" />
              </div>
            ) : (
              <div className="w-10 h-14 rounded-lg border border-stone-200 bg-stone-100 shrink-0 flex items-center justify-center text-stone-400">
                <Clock className="w-4 h-4" />
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {item.senderName || item.email}
                </p>
                {item.senderName && (
                  <span className="text-xs font-mono text-stone-500 truncate">{item.email}</span>
                )}
                {item.attemptCount > 1 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                    {item.attemptCount} attempts grouped
                  </span>
                )}
                {item.optInState === "opted_in" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Opted in
                  </span>
                )}
                {item.isTestOrder && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900">
                    Test / Founder
                  </span>
                )}
                {item.isSensitiveOccasion && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                    Sympathy
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-600">
                <span className="font-medium text-stone-800">{item.occasion}</span>
                {" · "}
                Last tried {formatDateWithRelative(item.latestAttemptAt)}
              </p>

              {item.followupStatus === "sent" && (
                <p className="text-xs text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Sent {formatShortDate(item.sentAt)}
                    {item.discountCodeUsed ? ` · Code ${item.discountCodeUsed}` : ""}
                    {item.deliveryOutcome ? ` · ${item.deliveryOutcome}` : ""}
                  </span>
                </p>
              )}
              {item.followupStatus === "uncertain" && (
                <p className="text-xs text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Delivery uncertain — check Resend before retrying</span>
                </p>
              )}
              {item.followupStatus === "suppressed" && (
                <p className="text-xs text-rose-700">Do not contact ({item.optInState})</p>
              )}
              {item.followupStatus === "skipped" && (
                <p className="text-xs text-stone-500">
                  Skipped {formatShortDate(item.skippedAt)}
                  {item.skipReason && item.skipReason !== "Skipped by founder" ? ` · ${item.skipReason}` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.followupStatus === "needs_followup" && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSkip(item.latestOrderId)}
                  className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition cursor-pointer disabled:opacity-40"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Skip</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isComposing
                      ? setTarget(null)
                      : openComposer({
                          kind: "incomplete",
                          orderId: item.latestOrderId,
                          email: item.email,
                          firstName: item.senderFirstName,
                          occasion: item.occasion,
                          isSensitiveOccasion: item.isSensitiveOccasion,
                          isTestOrder: item.isTestOrder,
                        })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-black px-3.5 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{isComposing ? "Close" : "Write note"}</span>
                </button>
              </>
            )}

            {showRestore && item.followupStatus === "skipped" && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleUnskip(item.latestOrderId)}
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
            )}

            {item.followupStatus === "auto_skipped_sympathy" && (
              <button
                type="button"
                onClick={() =>
                  isComposing
                    ? setTarget(null)
                    : openComposer({
                        kind: "incomplete",
                        orderId: item.latestOrderId,
                        email: item.email,
                        firstName: item.senderFirstName,
                        occasion: item.occasion,
                        isSensitiveOccasion: true,
                        isTestOrder: item.isTestOrder,
                      })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition cursor-pointer"
              >
                <span>{isComposing ? "Close" : "Override & write"}</span>
              </button>
            )}
          </div>
        </div>

        {renderComposer(item.latestOrderId)}
      </article>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
        <div>
          <h2 className="text-lg font-serif font-bold text-stone-900">Personal Follow-ups</h2>
          <p className="text-xs text-stone-500">
            Reach out personally from {readiness?.senderEmail || "zeke@sendmynotes.com"} for feedback or a thank-you code. Sympathy cards are auto-skipped.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTests}
              onChange={(e) => setIncludeTests(e.target.checked)}
              className="accent-stone-900"
            />
            <span>Show test/founder</span>
          </label>

          <button
            type="button"
            onClick={() => void loadInbox(includeTests)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            aria-expanded={showAutomation}
            onClick={() => setShowAutomation((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Automation (Off)</span>
            {showAutomation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Quiet readiness banner if live delivery is still paused */}
      {readiness && !readiness.canSendLive && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
          <strong>Preview mode:</strong> {readiness.blockers.join(" ")} You can draft notes, skip orders, and create discount codes now
          {!readiness.deliveryActive ? (
            <>
              —sending unlocks as soon as <code className="font-mono">MANUAL_FOLLOWUP_DELIVERY_ACTIVE=true</code> is enabled.
            </>
          ) : (
            <>—sending unlocks once the configuration blocker above is cleared.</>
          )}
        </div>
      )}

      {toast && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900 flex items-center justify-between">
          <span>{toast}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setToast("")}
            className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {error}
        </div>
      )}

      {/* Dormant automation drawer (only when explicitly expanded) */}
      {showAutomation && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-2">
          <p className="text-xs text-stone-600">
            Future automated sequence settings (currently paused and off by default until you decide to automate).
          </p>
          <PostPurchaseSettingsPanel />
        </div>
      )}

      {/* Sub-navigation pills */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Follow-up views">
        <button
          type="button"
          role="tab"
          aria-selected={subView === "paid"}
          onClick={() => setSubView("paid")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer inline-flex items-center gap-2 ${
            subView === "paid"
              ? "bg-stone-900 text-white shadow-xs"
              : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
          }`}
        >
          <span>Paid orders</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${subView === "paid" ? "bg-white/20 text-white" : "bg-stone-100 text-stone-700"}`}>
            {paidNeeds.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subView === "incomplete"}
          onClick={() => setSubView("incomplete")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer inline-flex items-center gap-2 ${
            subView === "incomplete"
              ? "bg-stone-900 text-white shadow-xs"
              : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
          }`}
        >
          <span>Incomplete checkouts</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${subView === "incomplete" ? "bg-white/20 text-white" : "bg-stone-100 text-stone-700"}`}>
            {incompleteNeeds.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subView === "other"}
          onClick={() => setSubView("other")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            subView === "other"
              ? "bg-stone-900 text-white shadow-xs"
              : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
          }`}
        >
          Feedback &amp; accounts
        </button>
      </div>

      {/* Paid orders view */}
      {subView === "paid" && (
        <div className="space-y-4">
          {loading && !data ? (
            <p className="text-sm text-stone-500 py-8 text-center">Loading paid orders…</p>
          ) : paidNeeds.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center space-y-1">
              <p className="text-sm font-semibold text-stone-800">All caught up on paid orders</p>
              <p className="text-xs text-stone-500">
                No uncontacted paid orders with an email address right now.
                {data?.counts.paidWithoutEmail ? ` (${data.counts.paidWithoutEmail} paid orders had no email.)` : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-3">{paidNeeds.map((item) => renderPaidRow(item))}</div>
          )}

          {paidSympathy.length > 0 && (
            <details className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-stone-700">
                Auto-skipped sympathy cards ({paidSympathy.length})
              </summary>
              <div className="mt-3 space-y-3">{paidSympathy.map((item) => renderPaidRow(item))}</div>
            </details>
          )}

          {paidDone.length > 0 && (
            <details className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-stone-700">
                Sent, skipped, or opted out ({paidDone.length})
              </summary>
              <div className="mt-3 space-y-3">{paidDone.map((item) => renderPaidRow(item, true))}</div>
            </details>
          )}
        </div>
      )}

      {/* Incomplete checkouts view */}
      {subView === "incomplete" && (
        <div className="space-y-4">
          <p className="text-xs text-stone-500">
            Grouped to 1 row per unique email. Anyone who later completed a paid order is automatically excluded.
          </p>
          {loading && !data ? (
            <p className="text-sm text-stone-500 py-8 text-center">Loading incomplete checkouts…</p>
          ) : incompleteNeeds.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center space-y-1">
              <p className="text-sm font-semibold text-stone-800">No incomplete checkouts waiting</p>
              <p className="text-xs text-stone-500">
                Unfinished checkouts with a captured email will show up here, collapsed to one row per person.
              </p>
            </div>
          ) : (
            <div className="space-y-3">{incompleteNeeds.map((item) => renderIncompleteRow(item))}</div>
          )}

          {incompleteSympathy.length > 0 && (
            <details className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-stone-700">
                Auto-skipped sympathy checkouts ({incompleteSympathy.length})
              </summary>
              <div className="mt-3 space-y-3">{incompleteSympathy.map((item) => renderIncompleteRow(item))}</div>
            </details>
          )}

          {incompleteDone.length > 0 && (
            <details className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-stone-700">
                Sent, skipped, or opted out ({incompleteDone.length})
              </summary>
              <div className="mt-3 space-y-3">{incompleteDone.map((item) => renderIncompleteRow(item, true))}</div>
            </details>
          )}
        </div>
      )}

      {/* Other contacts view (Feedback & accounts) */}
      {subView === "other" && <CapturedContactsPanel />}
    </div>
  );
}
