"use client";

import React, { useState } from "react";
import { MessageSquare, X, Send, CheckCircle2, Sparkles, Heart } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStep?: number;
  initialEmail?: string;
}

export function FeedbackModal({
  isOpen,
  onClose,
  currentStep,
  initialEmail = "",
}: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [category, setCategory] = useState<"general" | "bug" | "feature" | "compliment">("general");
  const [rating, setRating] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError("Please share your thoughts or suggestions before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback,
          email: email.trim() || undefined,
          category,
          rating,
          currentStep,
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to send feedback right now.");
      }

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setFeedback("");
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-[#FCFAF7]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-stone-900 leading-tight">
                Send Us Your Feedback
              </h3>
              <p className="text-[11px] text-stone-500">
                Help shape the future of Aster &amp; Blanche Press / sendmynotes.com
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h4 className="font-serif text-lg font-bold text-stone-900">
              Thank You for Your Feedback!
            </h4>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Your note has been delivered directly to the founder&apos;s desk. We deeply appreciate your eyes on the experience.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Category selection */}
            <div>
              <label className="block text-[11px] uppercase font-bold tracking-wider text-stone-500 mb-1.5">
                Feedback Type
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "general", label: "General" },
                  { id: "feature", label: "Idea" },
                  { id: "bug", label: "Bug / Fix" },
                  { id: "compliment", label: "Love it" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      category === cat.id
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Rating */}
            <div>
              <label className="block text-[11px] uppercase font-bold tracking-wider text-stone-500 mb-1.5">
                Rating
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`w-9 h-8 rounded-lg font-bold text-xs border transition cursor-pointer flex items-center justify-center gap-0.5 ${
                      rating >= star
                        ? "bg-amber-50 border-amber-300 text-amber-700 shadow-xs"
                        : "bg-stone-50 border-stone-200 text-stone-400 hover:bg-stone-100"
                    }`}
                  >
                    <span>★</span>
                    <span className="text-[10px]">{star}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Area */}
            <div>
              <label className="block text-[11px] uppercase font-bold tracking-wider text-stone-500 mb-1.5">
                Your Thoughts or Experience
              </label>
              <textarea
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  if (error) setError(null);
                }}
                rows={3}
                placeholder="What did you love? What felt confusing or slow? What would you like to see next?"
                className="w-full p-3 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition resize-none text-stone-800"
              />
            </div>

            {/* Email (Optional) */}
            <div>
              <label className="block text-[11px] uppercase font-bold tracking-wider text-stone-500 mb-1.5">
                Email Address <span className="text-stone-400 font-normal normal-case">(optional, for replies)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition text-stone-800"
              />
            </div>

            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

            {/* Submit Button */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Feedback</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
