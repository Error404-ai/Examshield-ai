/**
 * ProctoringOverlay Component
 * Webcam feed + alert ticker shown during an active exam
 */

import React from "react";
import { BehaviorAlert, AlertSeverity } from "../../types";
import { getAlertSeverityColor } from "../../utils";

interface ProctoringOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isConnected: boolean;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
}

const severityIcon: Record<AlertSeverity, string> = {
  [AlertSeverity.LOW]: "ℹ️",
  [AlertSeverity.MEDIUM]: "⚠️",
  [AlertSeverity.HIGH]: "🔶",
  [AlertSeverity.CRITICAL]: "🚨",
};

export const ProctoringOverlay: React.FC<ProctoringOverlayProps> = ({
  videoRef,
  isConnected,
  alerts,
  tabSwitchCount,
}) => {
  const recentAlerts = alerts.slice(-5).reverse();

  return (
    <div className="flex flex-col gap-3">
      {/* Webcam feed */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video w-full max-w-xs">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
          />
          <span className="text-xs text-white font-medium">
            {isConnected ? "Proctoring Active" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Tab switch counter */}
      {tabSwitchCount > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
          ⚠️ Tab switches detected: <strong>{tabSwitchCount}</strong>
          {tabSwitchCount >= 3 && " — Further switches may terminate your exam."}
        </div>
      )}

      {/* Alert feed */}
      {recentAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent Alerts</p>
          {recentAlerts.map((alert, i) => (
            <div
              key={i}
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