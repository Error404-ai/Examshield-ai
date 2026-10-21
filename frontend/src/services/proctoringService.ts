/**
 * Proctoring Service
 * Students: send short proctoring events detected in the browser.
 * Admins: read per-exam session summaries and per-session alert timelines,
 * and resolve student appeals.
 */

import api from "./api";
import { AlertSeverity } from "../types";
import type { IntegrityInfo, IntegrityStatus } from "./integrityService";

type Appeal = Record<string, unknown>;

export type ProctorEventType =
  | "tab_switch"
  | "fullscreen_exit"
  | "face_not_detected"
  | "multiple_faces"
  | "looking_away"
  | "eyes_closed"
  | "camera_blocked"
  | "phone_detected";

export interface ProctorEventPayload {
  alert_type: ProctorEventType;
  severity: AlertSeverity;
  description: string;
}

export type Recommendation = "approve" | "review" | "reject";

export interface SessionSummary {
  session_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: string;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  passed: boolean | null;
  grading_status?: "pending" | "done" | "failed";
  review_needed?: boolean;
  started_at: string | null;
  submitted_at: string | null;
  total_alerts: number;
  counts: Record<string, number>;
  suspicion_score: number;
  recommendation: Recommendation;
  integrity_status: IntegrityStatus | null;
  appeal: Appeal | null;
}

export interface ProctorAlertRow {
  alert_type: string;
  severity: AlertSeverity;
  description: string;
  timestamp: string;
}

export interface SessionAlertsDetail {
  session_id: string;
  exam_title: string;
  student_name: string;
  student_email: string;
  total_alerts: number;
  counts: Record<string, number>;
  suspicion_score: number;
  recommendation: Recommendation;
  integrity_status: IntegrityStatus | null;
  integrity: IntegrityInfo;
  alerts: ProctorAlertRow[];
  appeal: Appeal | null;
}

export const proctoringService = {
  async logEvent(
    sessionId: string,
    event: ProctorEventPayload
  ): Promise<{ success: boolean; tab_switch_count: number }> {
    const { data } = await api.post("/proctoring/events", {
      session_id: sessionId,
      ...event,
    });
    return data;
  },

  async getExamSessions(
    examId: string
  ): Promise<{ exam_title: string; sessions: SessionSummary[] }> {
    const { data } = await api.get(`/proctoring/exams/${examId}/sessions`);
    return { exam_title: data.exam_title, sessions: data.sessions };
  },

  async getSessionAlerts(sessionId: string): Promise<SessionAlertsDetail> {
    const { data } = await api.get(`/proctoring/sessions/${sessionId}/alerts`);
    return data;
  },

  async resolveAppeal(
    sessionId: string,
    decision: "accepted" | "rejected",
    note: string
  ): Promise<void> {
    await api.put(`/proctoring/sessions/${sessionId}/appeal`, { decision, note });
  },
};
