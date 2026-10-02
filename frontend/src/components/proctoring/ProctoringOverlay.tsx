/**
 * ProctoringOverlay Component
 * Webcam preview + status + recent alerts, shown during an active exam
 */

import React from "react";
import { BehaviorAlert, AlertSeverity } from "../../types";
import { getAlertSeverityColor } from "../../utils";
import type { MonitorStatus } from "../../hooks/useProctoring";

interface ProctoringOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: MonitorStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
}

const severityIcon: Record<AlertSeverity, string> = {
  [AlertSeverity.LOW]: "ℹ️",
  [AlertSeverity.MEDIUM]: "⚠️",
  [AlertSeverity.HIGH]: "🔶",
  [AlertSeverity.CRITICAL]: "🚨",
};

const statusLabel: Record<MonitorStatus, { text: string; dot: string }> = {
  idle: { text: "Camera off", dot: "bg-gray-400" },
  starting: { text: "Starting...", dot: "bg-yellow-400 animate-pulse" },
  active: { text: "Proctoring Active", dot: "bg-green-400 animate-pulse" },
  degraded: { text: "Camera only (AI unavailable)", dot: "bg-yellow-400" },
  denied: { text: "Camera blocked", dot: "bg-red-400" },
};

export const ProctoringOverlay: React.FC<ProctoringOverlayProps> = ({
  videoRef,
  status,
  alerts,
  tabSwitchCount,
}) => {
  const recentAlerts = alerts.slice(-3).reverse();
  const label = statusLabel[status];

  return (
    <div className="flex flex-col gap-2">
      {/* Webcam feed */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video w-full">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover -scale-x-100"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5">
          <span className={`h-2 w-2 rounded-full ${label.dot}`} />
          <span className="text-xs text-white font-medium">{label.text}</span>
        </div>
      </div>

      {/* Tab switch counter */}
      {tabSwitchCount > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          ⚠️ Tab switches: <strong>{tabSwitchCount}</strong>
          {tabSwitchCount >= 3 && " - Further switches may end your exam."}
        </div>
      )}

      {/* Alert feed */}
      {recentAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent Alerts</p>
          {recentAlerts.map((alert, i) => (
            <div
              key={`${alert.timestamp}-${i}`}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${getAlertSeverityColor(
                alert.severity
              )}`}
            >
              <span>{severityIcon[alert.severity]}</span>
              <span>{alert.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};