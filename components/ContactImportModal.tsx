"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  X,
  Sparkles,
  Users,
  Calendar,
  Lock,
} from "lucide-react";
import { parseContactData, ParsedContact, SAMPLE_CONTACTS_CSV } from "@/lib/contact-parser";
import { formatOccasionDate, getOccasionTypeDisplay } from "@/lib/reminder-utils";

interface ContactImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (contacts: ParsedContact[]) => Promise<void>;
}

export function ContactImportModal({ isOpen, onClose, onImport }: ContactImportModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [dragActive, setDragActive] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [optInReminders, setOptInReminders] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessRawText = (rawContent: string) => {
    setErrorMessage(null);
    try {
      const results = parseContactData(rawContent);
      if (results.length === 0) {
        setErrorMessage("No contacts could be recognized. Please check the file format or headers.");
        return;
      }
      setParsedContacts(results);
      // Select all valid contacts by default
      const validIndices = new Set<number>();
      results.forEach((c, idx) => {
        if (c.isValid) validIndices.add(idx);
      });
      setSelectedIndices(validIndices);
    } catch {
      setErrorMessage("Could not parse file. Ensure it is a valid CSV, TSV, or vCard file.");
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        handleProcessRawText(content);
      }
    };
    reader.onerror = () => {
      setErrorMessage("Failed to read the selected file.");
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CONTACTS_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sendmynotes_contacts_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleSelectIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === parsedContacts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedContacts.map((_, i) => i)));
    }
  };

  const handleConfirmImport = async () => {
    const selected = parsedContacts
      .filter((_, idx) => selectedIndices.has(idx))
      .map((c) => ({
        ...c,
        remindMe: optInReminders && Boolean(c.occasionMonth && c.occasionDay),
      }));

    if (selected.length === 0) return;

    setIsProcessing(true);
    try {
      await onImport(selected);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const validCount = parsedContacts.filter((c) => c.isValid).length;
  const occasionCount = parsedContacts.filter((c) => c.occasionMonth && c.occasionDay).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-stone-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-stone-900 font-serif">
                Import Contacts to Address Book
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Bring in friends, family, or clients from Apple Contacts, Google, Excel, or CSV in seconds.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-xl hover:bg-stone-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zero-Prying Privacy Guarantee Notice */}
        <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-stone-600 shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-stone-800">100% Client-Side Privacy:</strong> Your contact file is parsed directly inside your browser. No third-party data broker access, zero advertising telemetry, and zero unsolicited outreach.
          </div>
        </div>

        {/* STEP 1: UPLOAD / PASTE IF NO CONTACTS YET */}
        {parsedContacts.length === 0 ? (
          <div className="space-y-4 overflow-y-auto">
            {/* Input Method Switcher */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex bg-stone-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeTab === "file" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Upload CSV or vCard (.vcf)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paste")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeTab === "paste" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Paste from Excel / Sheets
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-amber-700 hover:text-amber-900 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Sample .CSV</span>
              </button>
            </div>

            {/* TAB A: FILE DROP */}
            {activeTab === "file" && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition ${
                  dragActive
                    ? "border-amber-500 bg-amber-50/50"
                    : "border-stone-300 hover:border-amber-400 hover:bg-stone-50/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.vcf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-stone-900">
                  Drop your CSV or vCard (.vcf) file here
                </h4>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  Supports Apple Contacts export (.vcf), Google Contacts (.csv), Postable, Minted, or any spreadsheet with addresses.
                </p>
                <span className="inline-block mt-3 px-4 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-black transition">
                  Browse File
                </span>
              </div>
            )}

            {/* TAB B: PASTE TEXT */}
            {activeTab === "paste" && (
              <div className="space-y-3">
                <textarea
                  rows={7}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Paste table copied from Excel or Google Sheets (Tab-separated or CSV)\nExample:\nSarah\tJenkins\t742 Evergreen Terr\tSpringfield\tOR\t97477\tBirthday\t04/18`}
                  className="w-full p-3.5 text-xs font-mono bg-stone-50 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!pasteText.trim()}
                    onClick={() => handleProcessRawText(pasteText)}
                    className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    Parse Pasted Contacts
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          /* STEP 2: REVIEW PARSED CONTACTS & SELECT WHO TO IMPORT */
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-stone-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-800">
                  {selectedIndices.size} of {parsedContacts.length} contacts selected
                </span>
                <span className="text-stone-400">•</span>
                <span className="text-emerald-700 font-medium">
                  {validCount} ready for mailing
                </span>
                {occasionCount > 0 && (
                  <>
                    <span className="text-stone-400">•</span>
                    <span className="text-amber-700 font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>{occasionCount} milestone dates detected</span>
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-stone-600 hover:text-stone-900 font-semibold underline cursor-pointer"
                >
                  {selectedIndices.size === parsedContacts.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParsedContacts([]);
                    setSelectedIndices(new Set());
                  }}
                  className="text-stone-400 hover:text-rose-600 font-medium cursor-pointer"
                >
                  Choose Different File
                </button>
              </div>
            </div>

            {/* Opt-in Email Reminders Checkbox */}
            {occasionCount > 0 && (
              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-300/60 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={optInReminders}
                  onChange={(e) => setOptInReminders(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold text-amber-950">
                    Opt-in to 14-day email reminders for detected birthdays &amp; anniversaries
                  </span>
                  <span className="text-[11px] text-amber-900/80 block">
                    We&apos;ll notify you two weeks ahead of each date with a 1-click link to pen their physical card.
                  </span>
                </div>
              </label>
            )}

            {/* Review Table Scrollable Container */}
            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {parsedContacts.map((contact, idx) => {
                const isSelected = selectedIndices.has(idx);
                const hasOccasion = contact.occasionMonth && contact.occasionDay;
                const occasionDisplay = hasOccasion
                  ? getOccasionTypeDisplay(contact.occasionType || "birthday")
                  : null;

                return (
                  <div
                    key={idx}
                    onClick={() => toggleSelectIndex(idx)}
                    className={`p-3.5 flex items-start gap-3 text-xs transition cursor-pointer ${
                      isSelected ? "bg-white hover:bg-amber-50/30" : "bg-stone-50/60 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent div click
                      className="mt-1 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
                    />

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900 text-sm">
                            {contact.firstName} {contact.lastName}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200/80">
                            {contact.label || "Friend"}
                          </span>
                        </div>

                        {contact.isValid ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>{contact.validationError}</span>
                          </span>
                        )}
                      </div>

                      <p className="text-stone-600 truncate">
                        {contact.street1} {contact.street2 && `(${contact.street2})`},{" "}
                        {contact.city}, {contact.state} {contact.zip}
                      </p>

                      {hasOccasion && occasionDisplay && (
                        <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-900">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100/70 border border-amber-200">
                            <span>{occasionDisplay.emoji}</span>
                            <span>
                              {occasionDisplay.label}:{" "}
                              {formatOccasionDate(
                                contact.occasionMonth!,
                                contact.occasionDay!,
                                contact.occasionYear
                              )}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition cursor-pointer"
          >
            Cancel
          </button>

          {parsedContacts.length > 0 && (
            <button
              type="button"
              disabled={selectedIndices.size === 0 || isProcessing}
              onClick={handleConfirmImport}
              className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>
                {isProcessing
                  ? "Importing..."
                  : `Import ${selectedIndices.size} Selected Contact${selectedIndices.size === 1 ? "" : "s"}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
