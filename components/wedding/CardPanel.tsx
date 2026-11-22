"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUploadStudioAccess } from "@/lib/upload/useUploadStudioAccess";
import {
  WEDDING_BRIDAL_FONTS,
  WEDDING_DEFAULT_FONT_ID,
  WEDDING_FONT_CATEGORIES,
  weddingFontCssFamily,
  weddingFontDisplayName,
} from "@/lib/wedding/fonts";
import { AddressFields } from "./AddressFields";
import { SaveStatus, useWeddingDraft } from "./useWeddingDraft";
import { trackWeddingFunnelEvent } from "@/lib/wedding/attribution-client";
import {
  blankAddress,
  errorMessage,
  pluralize,
  postWedding,
  safePreview,
  weddingRequest,
  WeddingRequestError,
  type Cover,
  type PanelProps,
  type Project,
  type Sender,
} from "./client";

const presets = [
  {
    id: "preset-thankyou-laurel",
    title: "Laurel wreath",
    url: "/presets/thank-you-laurel-wreath.jpg",
  },
  {
    id: "preset-thankyou-botanical",
    title: "Botanical",
    url: "/presets/thank-you-botanical.jpg",
  },
  {
    id: "preset-love-roses",
    title: "Garden roses",
    url: "/presets/love-roses.jpg",
  },
];

export const handFont = weddingFontCssFamily;

const BRIDAL_SAMPLE_NOTE =
  "Dear Aunt Sarah,\n\nThank you so much for celebrating with us and for the lovely linen napkins. We think of you every time we set the table!\n\nWith love,\nClaire & Jordan";

type Asset = { assetId: string; url: string };
type Meta = {
  provider?: string;
  model?: string;
  imageModel?: string;
  available?: boolean;
  imageStepUpRequired?: boolean;
  remaining?: { images: number };
  resetsAt?: number;
};

export function CardPanel({
  state,
  mutate,
  notify,
  signIn,
  registerFlush,
}: { registerFlush: (cb: () => Promise<boolean>) => () => void } & PanelProps) {
  const p = state.project;
  const { user, loading: authLoading } = useAuth();
  const studio = useUploadStudioAccess(user, authLoading);
  const [asset, setAsset] = useState<Asset | null>(null),
    [original, setOriginal] = useState<Asset | null>(null),
    [fit, setFit] = useState("cover"),
    [zoom, setZoom] = useState(1),
    [lettering, setLettering] = useState(""),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [dragging, setDragging] = useState(false);
  const [prompt, setPrompt] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [needsAuth, setNeedsAuth] = useState(false),
    [meta, setMeta] = useState<Meta>({});
  const [modified, setModified] = useState(false);
  const [aiIntent, setAiIntent] = useState(() => crypto.randomUUID());

  const refreshAI = () =>
    weddingRequest<Meta>("ai")
      .then(setMeta)
      .catch(() => {});
  useEffect(() => {
    void refreshAI();
  }, [state.actor.verified, state.actor.pilot]);
  useEffect(() => {
    setConsent(false);
    setAiIntent(crypto.randomUUID());
  }, [asset?.assetId]);

  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNeedsAuth(false);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      setNeedsAuth(
        e instanceof WeddingRequestError &&
          (e.code === "ai_sign_in_required" || e.code === "unauthorized"),
      );
    } finally {
      setBusy(false);
    }
  }

  const uploadArtworkFile = (f: File) =>
    work(async () => {
      const form = new FormData();
      form.append("file", f);
      const a = await weddingRequest<Asset>("artwork", {
        method: "POST",
        body: form,
      });
      setAsset(a);
      setOriginal(a);
      setFit("cover");
      setZoom(1);
      setX(0);
      setY(0);
      setLettering("");
      setModified(false);
    });

  const openStudio = async () => {
    if (!(await senderDraft.flush())) return;
    const fresh = await weddingRequest<{ project: Project }>("project");
    sessionStorage.setItem(
      "smn-wedding-studio-handoff",
      JSON.stringify({
        id: fresh.project.id,
        revision: fresh.project.revision,
      }),
    );
    location.assign("/create/upload?returnTo=wedding");
  };

  const saveCover = async (cover: Cover) => {
    await mutate("saveProject", { revision: p.revision, patch: { cover } });
    trackWeddingFunnelEvent("wedding_cover_saved", {
      coverKind: cover.kind,
      presetId: cover.kind === "preset" ? cover.id : undefined,
      projectId: p.id,
    });
    setAsset(null);
    setOriginal(null);
    notify("Your card front is saved.");
  };

  const senderDraft = useWeddingDraft<Sender>(
    p.returnAddress || {
      ...blankAddress,
      country: "US",
      firstName: "",
      lastName: "",
    },
    p.revision,
    async (value, revision) => {
      const r = await mutate("saveProject", {
        revision,
        patch: { returnAddress: { ...value, country: "US" } },
      });
      return (r.project as Project).revision;
    },
  );
  useEffect(
    () => registerFlush(senderDraft.flush),
    [registerFlush, senderDraft.flush],
  );

  const activeFontId = p.handwriting || WEDDING_DEFAULT_FONT_ID;
  const isBridalFont = WEDDING_BRIDAL_FONTS.some((f) => f.id === activeFontId);

  const returnName = [senderDraft.value.firstName, senderDraft.value.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const returnReady = Boolean(
    returnName &&
      senderDraft.value.address1?.trim() &&
      senderDraft.value.city?.trim() &&
      senderDraft.value.state?.trim() &&
      senderDraft.value.zip?.trim(),
  );
  const returnPreviewText = [
    returnName || "Claire & Jordan Miller",
    senderDraft.value.address1?.trim() || "123 Maple Street",
    senderDraft.value.address2?.trim(),
    [
      senderDraft.value.city?.trim() || "Chicago",
      senderDraft.value.state?.trim() || "IL",
      senderDraft.value.zip?.trim() || "60601",
    ]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="wed-columns">
      <section className="wed-panel">
        <h2>Your card front</h2>
        <div
          className={`wed-dropzone${dragging ? " wed-dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            const f = e.dataTransfer.files?.[0];
            if (f) void uploadArtworkFile(f);
          }}
        >
          <strong>Upload your favorite wedding photo</strong>
          <p className="wed-meta">
            Drag &amp; drop a photo here, or click to choose. JPG, PNG, or WebP
            up to 15 MB.
          </p>
          <label>
            Choose wedding photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadArtworkFile(f);
              }}
            />
          </label>
        </div>

        {asset && (
          <>
            <div className="wed-front-stage">
              <img
                src={safePreview(asset.url)}
                alt="Your proposed card front"
                style={{
                  objectFit: fit === "contain" ? "contain" : "cover",
                  transform: `scale(${zoom}) translate(${x * 20}%, ${y * 20}%)`,
                }}
              />
              {lettering.trim() && (
                <div className="wed-front-lettering">{lettering}</div>
              )}
            </div>
            <fieldset disabled={busy}>
              <legend>Crop &amp; personalize your photo</legend>
              <label>
                Fit
                <select
                  value={fit}
                  onChange={(e) => {
                    setFit(e.target.value);
                    setModified(true);
                  }}
                >
                  <option value="cover">Fill the card</option>
                  <option value="contain">Show the whole photo</option>
                </select>
              </label>
              <label>
                Zoom
                <input
                  type="range"
                  min="1"
                  max="2"
                  step=".05"
                  value={zoom}
                  onChange={(e) => {
                    setZoom(+e.target.value);
                    setModified(true);
                  }}
                />
              </label>
              <div className="wed-mini-grid">
                {(
                  [
                    ["Horizontal position", x, setX],
                    ["Vertical position", y, setY],
                  ] as const
                ).map(([label, v, set]) => (
                  <label key={label}>
                    {label}
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step=".05"
                      value={v}
                      onChange={(e) => {
                        set(+e.target.value);
                        setModified(true);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label>
                Optional names or wedding date
                <input
                  maxLength={40}
                  placeholder="Thank you · Claire & Jordan · Oct 12"
                  value={lettering}
                  onChange={(e) => {
                    setLettering(e.target.value);
                    setModified(true);
                  }}
                />
              </label>
            </fieldset>
            <div className="wed-actions">
              <button
                className="wed-primary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const finalAsset = modified
                      ? await postWedding<Asset>("artwork", {
                          action: "compose",
                          assetId: (original || asset).assetId,
                          fit,
                          zoom,
                          x,
                          y,
                          lettering,
                        })
                      : asset;
                    await saveCover({
                      kind: "upload",
                      id: finalAsset.assetId,
                      url: finalAsset.url,
                    });
                  })
                }
              >
                Save card front
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setAsset(null);
                  setOriginal(null);
                  setModified(false);
                }}
              >
                Cancel changes
              </button>
            </div>
          </>
        )}

        <span className="wed-divider">
          — or choose a timeless botanical front —
        </span>
        <div className="wed-thumbs">
          {presets.map((card) => (
            <button
              key={card.id}
              aria-pressed={p.cover?.id === card.id}
              disabled={busy}
              onClick={() =>
                void work(() =>
                  saveCover({ kind: "preset", id: card.id, url: card.url }),
                )
              }
            >
              <img src={card.url} alt="" />
              {card.title}
            </button>
          ))}
        </div>

        {studio.state === "active" && (
          <div className="wed-actions">
            <button disabled={busy} onClick={() => void work(openStudio)}>
              Open my account Upload Studio
            </button>
          </div>
        )}

        <details>
          <summary>Create a custom cover with AI</summary>
          <fieldset
            disabled={!state.actor.verified || busy || meta.available === false}
          >
            <label>
              Describe your design or photo treatment
              <textarea
                value={prompt}
                maxLength={1000}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setConsent(false);
                  setAiIntent(crypto.randomUUID());
                }}
              />
            </label>
            {meta.provider && (
              <p className="wed-meta">
                AI cover helper
                {meta.imageModel || meta.model
                  ? ` · ${meta.imageModel || meta.model}`
                  : ""}
                .{" "}
                {asset
                  ? "Your selected photo and description will be shared."
                  : "Only the design description will be shared."}
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Share this description{asset ? " and the selected photo" : ""} to
              generate a cover.
            </label>
          </fieldset>
          {!state.actor.verified ? (
            <button type="button" onClick={signIn}>
              Sign in to use AI helper
            </button>
          ) : (
            <button
              type="button"
              disabled={
                busy ||
                !consent ||
                !prompt.trim() ||
                meta.available === false ||
                meta.remaining?.images === 0 ||
                !meta.provider
              }
              onClick={() =>
                void work(async () => {
                  const a = await postWedding<Asset>("ai", {
                    action: "image",
                    prompt,
                    assetId: asset?.assetId,
                    consent: true,
                    idempotencyKey: aiIntent,
                  });
                  setAsset(a);
                  setOriginal(a);
                  void refreshAI();
                  setConsent(false);
                  setModified(false);
                  setAiIntent(crypto.randomUUID());
                })
              }
            >
              Generate artwork
            </button>
          )}
          {meta.available === false && (
            <p className="wed-notice">
              AI artwork is temporarily unavailable. You can still upload a
              wedding photo or choose a botanical front.
            </p>
          )}
          {meta.remaining && (
            <p className="wed-meta">
              {pluralize(meta.remaining.images, "artwork request")} remaining
              {meta.resetsAt
                ? " · resets " + new Date(meta.resetsAt).toLocaleString()
                : ""}
            </p>
          )}
        </details>
        {error && (
          <div role="alert" className="wed-notice">
            {error} {needsAuth && <button onClick={signIn}>Sign in</button>}
          </div>
        )}
        {busy && <p role="status">Preparing your card…</p>}
      </section>

      <section className="wed-note">
        <h2>On every card</h2>
        <img
          className="wed-front"
          src={safePreview(p.cover?.url)}
          alt="Selected wedding card front"
        />
        <h3>Handwriting style</h3>
        <p className="wed-meta">
          Written with real ballpoint ink on 120 lb vellum A2 cards.
        </p>
        <div role="radiogroup" aria-label="Handwriting style">
          {WEDDING_FONT_CATEGORIES.map((category) => (
            <div key={category}>
              <h4 className="wed-font-group-title">{category}</h4>
              <div className="wed-font-grid">
                {WEDDING_BRIDAL_FONTS.filter(
                  (f) => f.category === category,
                ).map((font) => {
                  const checked = activeFontId === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className="wed-font-swatch"
                      disabled={busy}
                      onClick={() =>
                        void work(async () => {
                          await mutate("saveProject", {
                            revision: p.revision,
                            patch: { handwriting: font.id },
                          });
                        })
                      }
                    >
                      <span
                        className="wed-font-sample"
                        style={{ fontFamily: font.cssFontFamily }}
                      >
                        Thank you so much
                      </span>
                      <span className="wed-font-head">
                        <span className="wed-font-label">
                          {font.displayName}
                        </span>
                        {checked && (
                          <span className="wed-font-check">✓ Selected</span>
                        )}
                      </span>
                      <span className="wed-font-vibe">{font.vibe}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {!isBridalFont && (
          <p className="wed-meta">
            Current style: {weddingFontDisplayName(activeFontId)} (saved from an
            earlier session — choose any style above to switch).
          </p>
        )}

        <h3>Inside pen &amp; ink preview</h3>
        <pre
          className="wed-letter wed-letter-preview"
          style={{ fontFamily: handFont(activeFontId) }}
        >
          {BRIDAL_SAMPLE_NOTE}
        </pre>

        <details open={!returnReady}>
          <summary>
            <span>Your return address</span>
            <span
              className={
                returnReady
                  ? "wed-pill wed-pill-ready"
                  : "wed-pill wed-pill-warn"
              }
            >
              {returnReady ? `${returnName} ✓` : "Required before mailing"}
            </span>
          </summary>
          <div
            className="wed-return-preview"
            style={{ fontFamily: handFont(activeFontId) }}
            aria-label="Live return address preview"
          >
            {returnPreviewText}
          </div>
          <div className="wed-mini-grid">
            <label>
              Names on your envelope
              <input
                placeholder="e.g., Claire & Jordan Miller or The Millers"
                value={senderDraft.value.firstName}
                onChange={(e) =>
                  senderDraft.update({
                    ...senderDraft.value,
                    firstName: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Last name (optional — skip if included above)
              <input
                value={senderDraft.value.lastName}
                onChange={(e) =>
                  senderDraft.update({
                    ...senderDraft.value,
                    lastName: e.target.value,
                  })
                }
              />
            </label>
          </div>
          <AddressFields
            domestic
            value={senderDraft.value}
            onChange={(a) => senderDraft.update({ ...senderDraft.value, ...a })}
          />
          <SaveStatus
            draft={senderDraft}
            other={
              <p>
                {Object.values(senderDraft.server).filter(Boolean).join(", ")}
              </p>
            }
          />
        </details>
      </section>
    </div>
  );
}
