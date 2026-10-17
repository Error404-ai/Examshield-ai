/**
 * ProctoringOverlay Component
 * Small floating webcam card with live AI status, shown during an exam.
 */

import React from "react";
import { BehaviorAlert } from "../../types";
import { getAlertSeverityColor } from "../../utils";
import { FaceStatus, ModelState } from "../../hooks/useProctoring";

interface ProctoringOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraReady: boolean;
  modelState: ModelState;
  faceStatus: FaceStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  maxTabSwitches: number;
}

const statusView: Record<FaceStatus, { label: string; dot: string }> = {
  idle: { label: "Starting…", dot: "bg-slate-400" },
  ok: { label: "Face verified", dot: "bg-emerald" },
  no_face: { label: "No face detected", dot: "bg-rose" },
  multiple_faces: { label: "Multiple faces", dot: "bg-rose" },
  looking_away: { label: "Looking away", dot: "bg-amber" },
  eyes_closed: { label: "Eyes closed", dot: "bg-amber" },
};

export const ProctoringOverlay: React.FC<ProctoringOverlayProps> = ({
  videoRef,
  cameraReady,
  modelState,
  faceStatus,
  alerts,
  tabSwitchCount,
  maxTabSwitches,
}) => {
  const recent = alerts.slice(-3).reverse();

  let label = statusView[faceStatus].label;
  let dot = statusView[faceStatus].dot;
  if (!cameraReady) {
    label = "Camera off";
    dot = "bg-rose";
  } else if (modelState === "loading") {
    label = "Loading AI model…";
    dot = "bg-cyan animate-pulse";
  } else if (modelState === "error") {
    label = "AI check unavailable";
    dot = "bg-slate-400";
  }

  return (
    <div className="fixed bottom-4 right-4 z-20 flex w-56 flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-navy-950 shadow-glass-lg">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="text-[11px] font-medium text-white">{label}</span>
        </div>
      </div>

      {tabSwitchCount > 0 && (
        <div className="glass-amber rounded-lg px-3 py-2 text-xs text-amber-300">
          Tab switches: <strong>{tabSwitchCount}</strong> / {maxTabSwitches}
          {tabSwitchCount >= maxTabSwitches - 2 && " — the exam auto-submits at the limit."}
        </div>
      )}

      {recent.map((a, i) => (
        <div key={i} className={`rounded-lg px-3 py-1.5 text-xs ${getAlertSeverityColor(a.severity)}`}>
          {a.description}
        </div>
      ))}
    </div>
  );
};