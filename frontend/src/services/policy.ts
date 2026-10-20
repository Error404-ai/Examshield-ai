/**
 * Proctoring policy: the one place that says what is flagged, how serious it
 * is, and how it is scored. The detection hook, the pre-exam notice and the
 * landing page all read from here, so what the product says matches what the
 * code does.
 *
 * The numbers marked "mirrors backend" must stay equal to
 * backend/app/routes/proctoring.py (SEVERITY_WEIGHT and _recommendation).
 */

import { AlertSeverity } from "../types";
import type { ProctorEventType } from "./proctoringService";

/** How often the camera is analysed, in milliseconds */
export const SAMPLE_MS = 500;

/** Mirrors backend SEVERITY_WEIGHT */
export const SEVERITY_POINTS: Record<AlertSeverity, number> = {
  [AlertSeverity.LOW]: 1,
  [AlertSeverity.MEDIUM]: 3,
  [AlertSeverity.HIGH]: 8,
  [AlertSeverity.CRITICAL]: 15,
};

/** Mirrors backend _recommendation(): below `review` approve, below `reject` review, else reject */
export const THRESHOLDS = { review: 20, reject: 50 } as const;

/** The exam is submitted automatically at this many tab switches */
export const MAX_TAB_SWITCHES = 3;

export interface Signal {
  type: ProctorEventType;
  label: string;
  /** Plain-language trigger, shown to students and on the landing page */
  when: string;
  severity: AlertSeverity;
  /** Consecutive camera checks (one per SAMPLE_MS) needed before the signal counts */
  samples?: number;
}

const seconds = (samples: number) => (samples * SAMPLE_MS) / 1000;

export const SIGNALS: Signal[] = [
  {
    type: "multiple_faces",
    label: "More than one person",
    severity: AlertSeverity.CRITICAL,
    samples: 3,
    when: `A second face stays in view for about ${seconds(3)} seconds`,
  },
  {
    type: "phone_detected",
    label: "Phone in view",
    severity: AlertSeverity.HIGH,
    when: "A phone is seen in two checks in a row. This is a hint for the reviewer, not proof",
  },
  {
    type: "face_not_detected",
    label: "No face in view",
    severity: AlertSeverity.HIGH,
    samples: 6,
    when: `Nobody is visible for about ${seconds(6)} seconds`,
  },
  {
    type: "camera_blocked",
    label: "Camera turned off",
    severity: AlertSeverity.HIGH,
    when: "The video stream ends in the middle of the exam",
  },
  {
    type: "tab_switch",
    label: "Left the exam tab",
    severity: AlertSeverity.MEDIUM,
    when: `The student switches tab or window. The exam is submitted at ${MAX_TAB_SWITCHES} switches`,
  },
  {
    type: "fullscreen_exit",
    label: "Left fullscreen",
    severity: AlertSeverity.MEDIUM,
    when: "Fullscreen is exited during the exam",
  },
  {
    type: "looking_away",
    label: "Looking away",
    severity: AlertSeverity.MEDIUM,
    samples: 6,
    when: `The head or eyes stay turned from the screen for about ${seconds(6)} seconds`,
  },
  {
    type: "eyes_closed",
    label: "Eyes closed",
    severity: AlertSeverity.LOW,
    samples: 8,
    when: `The eyes stay closed for about ${seconds(8)} seconds`,
  },
];

export const signalOf = (type: ProctorEventType): Signal => {
  const found = SIGNALS.find((s) => s.type === type);
  if (!found) throw new Error(`Unknown proctoring signal: ${type}`);
  return found;
};

export const severityOf = (type: ProctorEventType): AlertSeverity => signalOf(type).severity;

export const pointsOf = (type: ProctorEventType): number => SEVERITY_POINTS[severityOf(type)];

/** Display names, also used by the admin review page */
export const SIGNAL_LABELS: Record<string, string> = Object.fromEntries(
  SIGNALS.map((s) => [s.type, s.label])
);