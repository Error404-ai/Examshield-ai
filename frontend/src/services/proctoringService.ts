/**
 * Proctoring Service
 * The AI runs in the browser (MediaPipe). Only small event records are sent
 * to the server - no video frames ever leave the student's machine.
 */

import api from "./api";
import { ProctoringReport } from "../types";

export type ProctoringEventType =
  | "tab_switch"
  | "no_face"
  | "multiple_faces"
  | "looking_away"
  | "camera_off";

export const proctoringService = {
  /** Log one event. Server replies with the tab-switch count and whether to end the exam. */
  async logEvent(
    sessionId: string,
    alertType: ProctoringEventType
  ): Promise<{ tab_switch_count: number; terminate: boolean }> {
    const { data } = await api.post("/proctoring/event", {
      session_id: sessionId,
      alert_type: alertType,
    });
    return data;
  },

  /** Admin only: full proctoring report for one session. */
  async getReport(sessionId: string): Promise<ProctoringReport> {
    const { data } = await api.get(`/proctoring/report/${sessionId}`);
    return data.report;
  },
};