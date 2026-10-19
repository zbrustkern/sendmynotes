"use client";

import React, { useEffect, useRef } from "react";
import { trackEventV2 } from "@/lib/telemetry";
import { StableJourneyAssignment, stableIdFragment } from "@/lib/experiment-assignment";

/** Mount only around the actual experience variant. Exposure is emitted only
 * after the element is rendered and at least half is visible in the viewport. */
export default function ExperimentExposure({ assignment, sessionId, path, experienceVersion, children }: {
  assignment: StableJourneyAssignment;
  sessionId: string;
  path: string;
  experienceVersion: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    const element = root.current;
    if (!element || !sessionId || sent.current || typeof window === "undefined") return;
    const expose = () => {
      if (sent.current || document.visibilityState !== "visible") return;
      sent.current = true;
      const eventId = `exp_${stableIdFragment(`${assignment.assignmentId}|${sessionId}`)}`;
      void trackEventV2("experiment_exposed", {
        experimentId: assignment.experimentId, variantId: assignment.variantId,
      }, { eventId, experienceVersion: experienceVersion || assignment.version });
    };
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) expose();
      }, { threshold: [0.5] });
      observer.observe(element);
      return () => observer.disconnect();
    }
    // Without visibility measurement, exposure remains unobserved.
  }, [assignment, sessionId, path, experienceVersion]);

  return <div ref={root} data-experiment-id={assignment.experimentId} data-variant-id={assignment.variantId}>{children}</div>;
}
