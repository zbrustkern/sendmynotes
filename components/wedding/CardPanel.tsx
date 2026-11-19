"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUploadStudioAccess } from "@/lib/upload/useUploadStudioAccess";
import { AddressFields } from "./AddressFields";
import { SaveStatus, useWeddingDraft } from "./useWeddingDraft";
import {
  blankAddress,
  errorMessage,
  postWedding,
  safePreview,
  weddingRequest,
  type Cover,
  type PanelProps,
  type Project,
  type Sender,
} from "./client";
const presets = [
  {
    id: "preset-thankyou-botanical",
    title: "Botanical",
    url: "/presets/thank-you-botanical.jpg",
  },
  {
    id: "preset-thankyou-laurel",
    title: "Laurel wreath",
    url: "/presets/thank-you-laurel-wreath.jpg",
  },
  {
    id: "preset-love-roses",
    title: "Garden roses",
    url: "/presets/love-roses.jpg",
  },
];
const hands = [
  ["hwDavid", "Casual David"],
  ["hwChase", "Charming Chase"],
  ["hwKate", "Carefree Kate"],
  ["hwAdam", "Executive Adam"],
  ["hwWill", "Dapper Will"],
];
export function handFont(id: string) {
  return (
    "var(--font-hw-" +
    (hands
      .find((h) => h[0] === id)?.[0]
      .slice(2)
      .toLowerCase() || "david") +
    "), cursive"
  );
}
type Asset = { assetId: string; url: string };
type Meta = { provider?: string; model?: string; imageModel?: string };
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
    [y, setY] = useState(0);
  const [prompt, setPrompt] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [meta, setMeta] = useState<Meta>({});
  const [modified, setModified] = useState(false);
  const [aiIntent, setAiIntent] = useState(() => crypto.randomUUID());
  useEffect(() => {
    weddingRequest<Meta>("ai")
      .then(setMeta)
      .catch(() => {});
  }, []);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
  return (
    <div className="wed-columns">
      <section className="wed-panel">
        <h2>Your card front</h2>
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
        <h3>Upload a photo or design</h3>
        <p className="wed-meta">
          A still JPEG, PNG or WebP up to 15 MiB. You can crop it and add
          lettering.
        </p>
        {!state.actor.pilot && (
          <p className="wed-notice">
            Real uploads and AI artwork are open to invited staging testers. Use
            your pilot invitation, or sign in with an approved account.{" "}
            <button onClick={signIn}>Sign in</button>
          </p>
        )}
        <label>
          Choose photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || !state.actor.pilot}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void work(async () => {
                const form = new FormData();
                form.append("file", f);
                const a = await weddingRequest<Asset>("artwork", {
                  method: "POST",
                  body: form,
                });
                setAsset(a);
                setOriginal(a);
                setModified(false);
              });
            }}
          />
        </label>
        {asset && (
          <>
            <img
              className="wed-front"
              src={safePreview(asset.url)}
              alt="Your proposed cover"
            />
            <fieldset disabled={busy}>
              <legend>Adjust your cover</legend>
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
                disabled={busy || !modified}
                onClick={() =>
                  void work(async () => {
                    const a = await postWedding<Asset>("artwork", {
                      action: "compose",
                      assetId: (original || asset).assetId,
                      fit,
                      zoom,
                      x,
                      y,
                      lettering,
                    });
                    setAsset(a);
                    setModified(false);
                  })
                }
              >
                Preview changes
              </button>
              <button
                className="wed-primary"
                disabled={busy || modified}
                onClick={() =>
                  void work(() =>
                    saveCover({
                      kind: "upload",
                      id: asset.assetId,
                      url: asset.url,
                    }),
                  )
                }
              >
                Use this front
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setAsset(null);
                  setOriginal(null);
                }}
              >
                Cancel changes
              </button>
            </div>
          </>
        )}
        {studio.state === "active" && state.actor.pilot && (
          <button disabled={busy} onClick={() => void work(openStudio)}>
            Open my account Upload Studio
          </button>
        )}
        <details>
          <summary>Create a custom cover with AI</summary>
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
          <p className="wed-meta">
            {meta.provider || "Artwork provider"} ·{" "}
            {meta.imageModel || meta.model || "Model details unavailable"}.{" "}
            {asset
              ? "Your selected photo and description will be shared."
              : "Only the design description will be shared."}
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Share this description{asset ? " and the selected photo" : ""} to
            generate a cover.
          </label>
          <button
            disabled={
              busy ||
              !state.actor.pilot ||
              !consent ||
              !prompt.trim() ||
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
                setConsent(false);
                setModified(false);
                setAiIntent(crypto.randomUUID());
              })
            }
          >
            Generate artwork
          </button>
        </details>
        {error && (
          <div role="alert" className="wed-notice">
            {error} <button onClick={signIn}>Sign in</button>
          </div>
        )}
        {busy && <p role="status">Preparing your card…</p>}
      </section>
      <section className="wed-note">
        <h2>On every card</h2>
        <img
          className="wed-front"
          src={safePreview(p.cover?.url)}
          alt="Accepted wedding card front"
        />
        <label>
          Handwriting
          <select
            value={p.handwriting || "hwDavid"}
            onChange={(e) =>
              void work(async () => {
                await mutate("saveProject", {
                  revision: p.revision,
                  patch: { handwriting: e.target.value },
                });
              })
            }
          >
            {hands.map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p
          className="wed-letter"
          style={{ fontFamily: handFont(p.handwriting) }}
        >
          Thank you for thinking of us.
        </p>
        <details>
          <summary>Your personal return address</summary>
          <div className="wed-mini-grid">
            <label>
              First name or full joint label
              <input
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
              Last name (optional)
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
