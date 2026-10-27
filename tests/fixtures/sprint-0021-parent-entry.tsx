import React from "react";
import { createRoot } from "react-dom/client";
import { EntryPrototypeClient } from "../../app/preview/entry/client";

let parentRoot: ReturnType<typeof createRoot> | null = null;
window.__startParent = (initialStep = "pay") => {
  parentRoot?.unmount();
  parentRoot = createRoot(document.getElementById("parent-root")!);
  parentRoot.render(<EntryPrototypeClient initialStep={initialStep as "pay" | "card"} />);
};

declare global {
  interface Window {
    __startParent: (initialStep?: string) => void;
    __latestEmailState?: "empty" | "set";
    __fixtureAuthUser: { email: string; uid: string } | null;
    __setFixtureAuthUser: (user: { email: string; uid: string } | null) => void;
    __fixtureDraftChoice: string;
  }
}
