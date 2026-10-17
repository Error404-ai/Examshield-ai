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
  idle: { label: "Starting…", dot: "bg-gray-400" },
  ok: { label: "Face verified", dot: "bg-green-400" },
  no_face: { label: "No face detected", dot: "bg-red-400" },
  multiple_faces: { label: "Multiple faces", dot: "bg-red-500" },
  looking_away: { label: "Looking away", dot: "bg-yellow-400" },
  eyes_closed: { label: "Eyes closed", dot: "bg-yellow-400" },
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
    dot = "bg-red-400";
  } else if (modelState === "loading") {
    label = "Loading AI model…";
    dot = "bg-blue-400 animate-pulse";
  } else if (modelState === "error") {
    label = "AI check unavailable";
    dot = "bg-gray-400";
  }

  return (
    <div className="fixed bottom-4 right-4 z-20 w-56 flex flex-col gap-2">
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video shadow-lg">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="text-[11px] text-white font-medium">{label}</span>
        </div>
      </div>

      {tabSwitchCount > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
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