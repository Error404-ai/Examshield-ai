/**
 * Grading Service (admin)
 * Review a finished attempt, override the AI's marks on written answers,
 * and re-run AI grading after a failure.
 */

import api from "./api";

export type GradingState = "none" | "pending" | "ai" | "manual" | "failed";

export interface ReviewAnswer {
  question_id: string;
  question_type?: string;
  question_text: string;
  selected_answer: string;
  correct_answer: string; // the model answer for written questions
  options?: string[];
  rubric?: string;
  marks: number;
  marks_awarded: number;
  is_correct: boolean;
  grading?: GradingState;
  feedback?: string;
  confidence?: "high" | "medium" | "low";
  needs_review?: boolean;
  examiner_note?: string;
}

export interface ReviewSession {
  _id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  student_email: string;
  status: string;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  grading_status?: "pending" | "done" | "failed";
  grading_error?: string;
  review_needed?: boolean;
  submitted_at?: string;
  started_at?: string;
  answers: ReviewAnswer[];
  proctoring_alerts: {
    alert_type: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    timestamp: string;
  }[];
}

export interface GradeResult {
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  grading_status: "done" | "failed";
}

export const gradingService = {
  async review(sessionId: string): Promise<ReviewSession> {
    const { data } = await api.get(`/admin/sessions/${sessionId}/review`);
    return data.session;
  },

  async gradeAnswer(
    sessionId: string,
    questionId: string,
    marks: number,
    note: string
  ): Promise<GradeResult> {
    const { data } = await api.put(`/admin/sessions/${sessionId}/answers/${questionId}/grade`, {
      marks,
      note,
    });
    return data;
  },

  async regrade(sessionId: string): Promise<void> {
    await api.post(`/admin/sessions/${sessionId}/regrade`);
  },
};