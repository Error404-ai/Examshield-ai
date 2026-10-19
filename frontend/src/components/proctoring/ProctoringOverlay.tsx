/**
 * ProctoringOverlay Component
 * Small camera tile, one live status line, and the latest alerts as plain text.
 * Props match the values returned by useProctoring.
 */

import React from "react";
import { BehaviorAlert, AlertSeverity } from "../../types";
import type { FaceStatus, ModelState } from "../../hooks/useProctoring";

interface ProctoringOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraReady: boolean;
  cameraError: string;
  modelState: ModelState;
  phoneDetectorState: ModelState;
  faceStatus: FaceStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  maxTabSwitches: number;
}

const OK = "bg-green-600";
const WARN = "bg-amber-500";
const BAD = "bg-red-600";

const faceLabel: Record<FaceStatus, { text: string; dot: string }> = {
  idle: { text: "Proctoring active", dot: OK },
  ok: { text: "Proctoring active", dot: OK },
  no_face: { text: "No face visible", dot: BAD },
  multiple_faces: { text: "More than one person in view", dot: BAD },
  looking_away: { text: "Looking away from the screen", dot: WARN },
  eyes_closed: { text: "Eyes closed", dot: WARN },
};

const severityBar: Record<AlertSeverity, string> = {
  [AlertSeverity.LOW]: "border-gray-300",
  [AlertSeverity.MEDIUM]: "border-amber-400",
  [AlertSeverity.HIGH]: "border-orange-500",
  [AlertSeverity.CRITICAL]: "border-red-600",
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export const ProctoringOverlay: React.FC<ProctoringOverlayProps> = ({
  videoRef,
  cameraReady,
  cameraError,
  modelState,
  phoneDetectorState,
  faceStatus,
  alerts,
  tabSwitchCount,
  maxTabSwitches,
}) => {
  const recentAlerts = alerts.slice(-3).reverse();

  let label: { text: string; dot: string };
  if (cameraError) label = { text: "Camera problem", dot: BAD };
  else if (!cameraReady) label = { text: "Camera off", dot: "bg-gray-400" };
  else if (modelState === "loading" || modelState === "idle")
    label = { text: "Loading detection", dot: `${WARN} animate-pulse` };
  else if (modelState === "error") label = { text: "Camera only, detection unavailable", dot: WARN };
  else label = faceLabel[faceStatus];

  return (
    <div className="flex flex-col gap-3">
      {/* The video element stays mounted so the camera can attach to it */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
      </div>

      <p className="flex items-center gap-2 text-sm text-gray-700" role="status">
        <span className={`h-2 w-2 shrink-0 rounded-full ${label.dot}`} />
        {label.text}
      </p>

      {cameraReady && modelState === "ready" && phoneDetectorState === "error" && (
        <p className="text-xs text-gray-500">Phone detection is unavailable on this device.</p>
      )}

      {tabSwitchCount > 0 && (
        <p className="text-sm text-amber-800">
          Tab switches: <strong>{tabSwitchCount}</strong>
          {tabSwitchCount >= maxTabSwitches - 1 && `. The exam ends at ${maxTabSwitches}.`}
        </p>
      )}

      {recentAlerts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {recentAlerts.map((alert, i) => (
            <li
              key={`${alert.timestamp}-${i}`}
              className={`border-l-2 pl-3 text-sm text-gray-700 ${severityBar[alert.severity]}`}
            >
              {alert.description}
              <span className="ml-2 text-xs tabular-nums text-gray-400">{timeOf(alert.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};