/**
 * Integrity Service
 * Admins: work the flagged-session queue, confirm or dismiss, answer appeals.
 * Students: see a confirmed flag on their own result and appeal it.
 */

import api from "./api";
import { AlertSeverity } from "../types";

export type IntegrityStatus =
  | "clear"
  | "pending"
  | "confirmed"
  | "dismissed"
  | "appealed"
  | "upheld"
  | "overturned";

export type QueueFilter = "pending" | "appealed" | "resolved" | "all";
export type AppealOutcome = "upheld" | "overturned";

export interface IntegrityHistoryEntry {
  action: string;
  by: string;
  role: "admin" | "student";
  note: string;
  at: string | null;
}

export interface IntegrityAppeal {
  message: string;
  submitted_at: string | null;
  status: "open" | AppealOutcome;
  response_note?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

/** Admin view of a session's integrity sub-document */
export interface IntegrityInfo {
  decision: "confirmed" | "dismissed" | null;
  decision_note: string;
  decided_at: string | null;
  decided_by?: string | null;
  appeal_deadline: string | null;
  appeal: IntegrityAppeal | null;
  history?: IntegrityHistoryEntry[];
}

export interface QueueRow {
  session_id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: IntegrityStatus;
  session_status: string;
  percentage: number | null;
  submitted_at: string | null;
  total_alerts: number;
  counts: Record<string, number>;
  suspicion_score: number;
  recommendation: "approve" | "review" | "reject";
  decided_at: string | null;
  appeal_submitted_at: string | null;
}

export interface QueueResponse {
  counts: Record<QueueFilter, number>;
  rows: QueueRow[];
}

export interface StudentAlert {
  alert_type: string;
  severity: AlertSeverity;
  description: string;
  timestamp: string;
}

/** What a student is allowed to see. `flagged: false` means show nothing. */
export interface MyIntegrity {
  flagged: boolean;
  status?: IntegrityStatus;
  decision_note?: string;
  decided_at?: string | null;
  appeal?: IntegrityAppeal | null;
  appeal_deadline?: string | null;
  can_appeal?: boolean;
  appeal_block_reason?: string | null;
  total_alerts?: number;
  counts?: Record<string, number>;
  alerts?: StudentAlert[];
}

export const STATUS_LABEL: Record<IntegrityStatus, string> = {
  clear: "No flag",
  pending: "Needs decision",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
  appealed: "Appeal open",
  upheld: "Upheld after appeal",
  overturned: "Overturned on appeal",
};

export const STATUS_VARIANT: Record<IntegrityStatus, "neutral" | "warning" | "error" | "info" | "success"> = {
  clear: "neutral",
  pending: "warning",
  confirmed: "error",
  dismissed: "neutral",
  appealed: "info",
  upheld: "error",
  overturned: "success",
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  tab_switch: "Tab switches",
  fullscreen_exit: "Fullscreen exits",
  face_not_detected: "No face",
  multiple_faces: "Multiple faces",
  looking_away: "Looking away",
  eyes_closed: "Eyes closed",
  camera_blocked: "Camera blocked",
  phone_detected: "Phone seen",
};

export const integrityService = {
  async getQueue(status: QueueFilter, examId?: string): Promise<QueueResponse> {
    const { data } = await api.get("/integrity/queue", {
      params: { status, ...(examId ? { exam_id: examId } : {}) },
    });
    return { counts: data.counts, rows: data.rows };
  },

  async decide(sessionId: string, decision: "confirmed" | "dismissed", note: string): Promise<void> {
    await api.post(`/integrity/sessions/${sessionId}/decision`, { decision, note });
  },

  async resolveAppeal(sessionId: string, outcome: AppealOutcome, note: string): Promise<void> {
    await api.post(`/integrity/sessions/${sessionId}/appeal/resolve`, { outcome, note });
  },

  async getMine(sessionId: string): Promise<MyIntegrity> {
    const { data } = await api.get(`/integrity/my/${sessionId}`);
    return data;
  },

  async appeal(sessionId: string, message: string): Promise<MyIntegrity> {
    const { data } = await api.post(`/integrity/my/${sessionId}/appeal`, { message });
    return data;
  },
};
