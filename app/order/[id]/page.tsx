"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  PenTool,
  Mail,
  Truck,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Coins,
  ShieldCheck,
} from "lucide-react";
import { Order } from "@/lib/types";

export default function OrderStatusPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) {
          throw new Error("Order not found or still processing.");
        }
        const data = await res.json();
        if (isMounted) {
          setOrder(data.order);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Error loading order");
          setLoading(false);
        }
      }
    };

    fetchOrder();
    // Poll every 5s if order is still pending
    const interval = setInterval(fetchOrder, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center animate-bounce shadow-lg shadow-amber-600/25 mb-4">
          <PenTool className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-serif text-stone-900 mb-2">
          Retrieving Physical Order Tracker...
        </h2>
        <p className="text-sm text-stone-500">Checking robotic plotter queue</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-lg max-w-md w-full">
          <h2 className="text-lg font-bold text-stone-900 mb-2">Order Notice</h2>
          <p className="text-sm text-stone-600 mb-6">{error || "Could not locate this order."}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-sm font-semibold rounded-xl hover:bg-black transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const isFulfilled =
    order.status === "PROCESSING_HANDWRYTTEN" || order.status === "PAYMENT_RECEIVED";

  const trackingSteps = [
    {
      title: "Payment Confirmed ($6.50 Paid)",
      description: "Transaction complete. Receipt delivered to email.",
      icon: CheckCircle2,
      status: "complete",
    },
    {
      title: "Artwork Printed on 5×7 Linen",
      description: "Cover artwork & left page printed sentiment pressed.",
      icon: Sparkles,
      status: "complete",
    },
    {
      title: "Robotic Pen Inking In Progress",
      description: `Handwrytten robotic plotter applying real blue ballpoint ink to right page. ${
        order.handwryttenOrderId ? `(ID: ${order.handwryttenOrderId})` : ""
      }`,
      icon: PenTool,
      status: isFulfilled ? "current" : "upcoming",
    },
    {
      title: "Enveloped & Stamped",
      description: `Addressed to ${order.recipientAddress.firstName} ${order.recipientAddress.lastName} with USPS First Class postage.`,
      icon: Mail,
      status: "upcoming",
    },
    {
      title: "Mailed via USPS First Class",
      description: "Dispatched into postal stream. Estimated delivery: 2-4 business days.",
      icon: Truck,
      status: "upcoming",
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-20 text-stone-900">
      {/* HEADER */}
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Send Another Card</span>
          </Link>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Order Reference</span>
            <span className="font-mono text-xs text-stone-700">{order.id}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* SUCCESS BANNER */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-md text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
            Order Confirmed & Sent to Robotic Inking!
          </h1>
          <p className="text-stone-600 text-sm max-w-lg mx-auto">
            Your card is currently queued on a Handwrytten robotic pen plotter. We will write it with real ink, stamp it, and mail it directly to your recipient.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="bg-amber-50 text-amber-800 font-semibold px-3 py-1 rounded-full border border-amber-200">
              Receipt Sent: {order.customerEmail || "Delivered"}
            </span>
            <span className="bg-indigo-50 text-indigo-800 font-semibold px-3 py-1 rounded-full border border-indigo-200">
              Robotic Pen: Active
            </span>
            <span className="bg-emerald-50 text-emerald-800 font-semibold px-3 py-1 rounded-full border border-emerald-200">
              USPS Postage: Included
            </span>
          </div>
        </div>

        {/* ROBOTIC FULFILLMENT TIMELINE */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-md space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-indigo-600" />
              Robotic Fulfillment Tracker
            </h2>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {order.status}
            </span>
          </div>

          <div className="space-y-6">
            {trackingSteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="flex items-start gap-4">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      step.status === "complete"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                        : step.status === "current"
                        ? "bg-amber-500 text-white animate-pulse shadow-md shadow-amber-500/20"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-bold ${
                          step.status === "upcoming" ? "text-stone-400" : "text-stone-900"
                        }`}
                      >
                        {step.title}
                      </h3>
                      {step.status === "current" && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ORDER DETAILS & MAILING SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Preview Thumbnail */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-md flex flex-col justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Physical 5×7 Folded Card
            </h3>
            <div className="relative aspect-[5/7] w-full rounded-2xl overflow-hidden shadow-md border-2 border-stone-100">
              <Image
                src={order.frontImageUrl}
                alt="Front Cover"
                fill
                className="object-cover"
              />
            </div>
            <div className="mt-4 pt-4 border-t border-stone-100 text-xs space-y-1 text-stone-600">
              <p>
                <strong>Inside Top:</strong> &ldquo;{order.printedMessage}&rdquo;
              </p>
              <p className="text-indigo-800 font-medium">
                <strong>Inside Bottom (Robot Pen):</strong> &ldquo;{order.handwrittenNote.slice(0, 100)}...&rdquo;
              </p>
            </div>
          </div>

          {/* Recipient & Shipping Details */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-md space-y-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-600" />
                Mailing Destination
              </h3>
              <div className="p-3.5 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-800">
                <p className="font-bold text-sm">
                  {order.recipientAddress.firstName} {order.recipientAddress.lastName}
                </p>
                <p>{order.recipientAddress.street1}</p>
                {order.recipientAddress.street2 && <p>{order.recipientAddress.street2}</p>}
                <p>
                  {order.recipientAddress.city}, {order.recipientAddress.state} {order.recipientAddress.zip}
                </p>
                <p className="text-stone-400 text-[11px] pt-1">United States of America</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                Return Address
              </h3>
              <div className="p-3.5 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-600">
                <p className="font-semibold">
                  {order.returnAddress.firstName} {order.returnAddress.lastName}
                </p>
                <p>{order.returnAddress.street1}</p>
                <p>
                  {order.returnAddress.city}, {order.returnAddress.state} {order.returnAddress.zip}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/60 text-xs flex items-center justify-between text-amber-900">
              <span>Amount Paid</span>
              <span className="font-serif font-bold text-base">$6.50 Flat Rate</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-xl shadow-amber-600/20 transition-all cursor-pointer"
          >
            <PenTool className="w-4 h-4 text-amber-100" />
            <span>Send Another Card ($6.50)</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
