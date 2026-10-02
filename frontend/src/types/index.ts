// ============ Enums ============

export enum UserRole {
  STUDENT = "student",
  ADMIN = "admin",
}

export enum QuestionType {
  MCQ = "mcq",
  SHORT_ANSWER = "short_answer",
  ESSAY = "essay",
  TRUE_FALSE = "true_false",
}

export enum SessionStatus {
  ONGOING = "ongoing",
  SUBMITTED = "submitted",
  EXPIRED = "expired",
  PROCTORING_FAILED = "proctoring_failed",
}

export enum AlertSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

// ============ User ============

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at?: string;
}

export interface AuthState {
  user: User | null;
  access_token: string | null;
  isAuthenticated: boolean;
}

// ============ Auth ============

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  confirm_password: string;
  role: UserRole;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  access_token: string;
  token_type: string;
  user: User;
}

// ============ Exam ============

export interface Exam {
  _id: string;
  title: string;
  description: string;
  duration: number;
  total_marks: number;
  passing_marks: number;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  attempted?: boolean;
  session_status?: SessionStatus | null;
}

export interface ExamCreate {
  title: string;
  description: string;
  duration: number;
  total_marks: number;
  passing_marks: number;
}

export interface ExamUpdate extends Partial<ExamCreate> {
  is_published?: boolean;
}

// ============ Question ============

export interface Question {
  _id: string;
  exam_id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  marks: number;
  correct_answer?: string;
  created_at?: string;
}

export interface QuestionCreate {
  exam_id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  correct_answer: string;
  marks: number;
}

// ============ Session ============

export interface StudentAnswer {
  question_id: string;
  selected_answer: string;
}

export interface SessionSubmit {
  session_id: string;
  answers: StudentAnswer[];
}

export interface GradedAnswer {
  question_id: string;
  question_text?: string;
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  marks: number;
  marks_awarded: number;
}

export interface ExamResult {
  _id: string;
  student_id: string;
  exam_id: string;
  exam_title?: string;
  student_name?: string;   // admin results view only
  student_email?: string;  // admin results view only
  status: SessionStatus;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  started_at: string;
  submitted_at?: string;
  answers?: GradedAnswer[];
}

// ============ Proctoring ============

export interface BehaviorAlert {
  session_id: string;
  alert_type: string;
  severity: AlertSeverity;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ProctoringData {
  isConnected: boolean;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  faceDetected?: boolean;
  lookingAtScreen?: boolean;
}

export interface FrameAnalysisPayload {
  type: "frame_analysis";
  face_detected: boolean;
  looking_at_screen: boolean;
  tab_active: boolean;
}

export interface ProctoringReport {
  session_id: string;
  total_events: number;
  critical_incidents: number;
  high_incidents: number;
  medium_incidents: number;
  low_incidents: number;
  tab_switches: number;
  suspicion_score: number;
  recommendation: "approve" | "review" | "reject";
  generated_at: string;
}

// ============ Dashboard Stats ============

export interface AdminStats {
  total_exams: number;
  published_exams: number;
  total_students: number;
  total_sessions: number;
}

export interface StudentStats {
  available_exams: number;
  attempted: number;
  passed: number;
  failed: number;
}

// ============ API Response Wrapper ============

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}