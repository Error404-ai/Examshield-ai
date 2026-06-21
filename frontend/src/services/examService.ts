/**
 * Exam Service
 * Exam CRUD, questions, session management
 */

import api from "./api";
import {
  Exam,
  ExamCreate,
  ExamUpdate,
  Question,
  QuestionCreate,
  SessionSubmit,
  ExamResult,
  AdminStats,
  StudentStats,
} from "../types";

// ============ Admin ============

export const adminService = {
  async getDashboard(): Promise<AdminStats> {
    const { data } = await api.get<{ success: boolean; stats: AdminStats }>("/admin/dashboard");
    return data.stats;
  },

  async createExam(payload: ExamCreate): Promise<{ exam_id: string }> {
    const { data } = await api.post("/admin/exams", payload);
    return data;
  },

  async getExams(): Promise<Exam[]> {
    const { data } = await api.get<{ success: boolean; exams: Exam[] }>("/admin/exams");
    return data.exams;
  },

  async getExam(examId: string): Promise<{ exam: Exam; questions: Question[] }> {
    const { data } = await api.get(`/admin/exams/${examId}`);
    return { exam: data.exam, questions: data.questions };
  },

  async updateExam(examId: string, payload: ExamUpdate): Promise<void> {
    await api.put(`/admin/exams/${examId}`, payload);
  },

  async deleteExam(examId: string): Promise<void> {
    await api.delete(`/admin/exams/${examId}`);
  },

  async publishExam(examId: string): Promise<void> {
    await api.post(`/admin/exams/${examId}/publish`);
  },

  async addQuestion(payload: QuestionCreate): Promise<{ question_id: string }> {
    const { data } = await api.post("/admin/questions", payload);
    return data;
  },

  async deleteQuestion(questionId: string): Promise<void> {
    await api.delete(`/admin/questions/${questionId}`);
  },

  async getExamResults(examId: string): Promise<{
    exam_title: string;
    total_attempts: number;
    passed: number;
    failed: number;
    average_score: number;
    results: ExamResult[];
  }> {
    const { data } = await api.get(`/admin/exams/${examId}/results`);
    return data;
  },
};

// ============ Student ============

export const studentService = {
  async getDashboard(): Promise<StudentStats> {
    const { data } = await api.get<{ success: boolean; stats: StudentStats }>("/student/dashboard");
    return data.stats;
  },

  async getAvailableExams(): Promise<Exam[]> {
    const { data } = await api.get<{ success: boolean; exams: Exam[] }>("/student/exams");
    return data.exams;
  },

  async getExam(examId: string): Promise<{ exam: Exam; questions: Question[] }> {
    const { data } = await api.get(`/student/exams/${examId}`);
    return { exam: data.exam, questions: data.questions };
  },

  async startSession(examId: string): Promise<{
    session_id: string;
    duration_minutes: number;
    started_at: string;
  }> {
    const { data } = await api.post(`/student/exams/${examId}/start`);
    return data;
  },

  async submitExam(payload: SessionSubmit): Promise<{
    result: {
      score: number;
      total_marks: number;
      percentage: number;
      passed: boolean;
      passing_marks: number;
    };
  }> {
    const { data } = await api.post("/student/sessions/submit", payload);
    return data;
  },

  async getMyResults(): Promise<ExamResult[]> {
    const { data } = await api.get<{ success: boolean; results: ExamResult[] }>("/student/results");
    return data.results;
  },

  async getResultDetail(sessionId: string): Promise<ExamResult> {
    const { data } = await api.get(`/student/results/${sessionId}`);
    return data.result;
  },
};