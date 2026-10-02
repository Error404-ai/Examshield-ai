/**
 * Exam Page - student takes the exam
 * Loader (fetch + start/resume session) is split from the runner so the
 * timer only mounts once the real remaining time is known.
 * The runner turns on the webcam + browser AI proctoring and hides the
 * questions until the camera is working.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { QuestionCard } from "../../components/exam/QuestionCard";
import { ProctoringOverlay } from "../../components/proctoring/ProctoringOverlay";
import { useExamTimer } from "../../hooks/useExamTimer";
import { useProctoring } from "../../hooks/useProctoring";
import { Exam, Question, StudentAnswer } from "../../types";
import { getErrorMessage } from "../../utils";

// ─── Runner ──────────────────────────────────────────────────────────────────

interface RunnerProps {
  exam: Exam;
  questions: Question[];
  sessionId: string;
  remainingSeconds: number;
}

const ExamRunner: React.FC<RunnerProps> = ({ exam, questions, sessionId, remainingSeconds }) => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittedRef = useRef(false);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await studentService.submitExam({
        session_id: sessionId,
        answers: Object.entries(answersRef.current).map(([question_id, selected_answer]) => ({
          question_id,
          selected_answer,
        })),
      });
      navigate(`/student/results/${sessionId}`, { replace: true });
    } catch (err) {
      submittedRef.current = false;
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, navigate]);

  const { timeLeft, formattedTime } = useExamTimer(remainingSeconds, submit);

  // Too many tab switches -> the server tells us to end the exam, we auto-submit
  const { status, alerts, tabSwitchCount, videoRef, startMonitoring } = useProctoring(sessionId, submit);

  // Turn the camera on as soon as the exam opens
  useEffect(() => {
    startMonitoring();
  }, [startMonitoring]);

  const handleAnswer = (a: StudentAnswer) =>
    setAnswers((prev) => ({ ...prev, [a.question_id]: a.selected_answer }));

  const handleSubmitClick = () => {
    const unanswered = questions.length - Object.keys(answers).length;
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question(s). Submit anyway?`
      : "Submit your exam now?";
    if (window.confirm(msg)) submit();
  };

  // Warn before accidental refresh/close
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const cameraReady = status === "active" || status === "degraded";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{exam.title}</h1>
            <p className="text-sm text-gray-500">
              Question {index + 1} of {questions.length}
            </p>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${timeLeft < 300 ? "text-red-600" : "text-gray-900"}`}>
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Webcam + alerts: always mounted so the video element exists when the camera starts */}
      <div className="fixed bottom-4 right-4 z-20 w-64 rounded-xl bg-white border border-gray-200 shadow-lg p-2">
        <ProctoringOverlay
          videoRef={videoRef}
          status={status}
          alerts={alerts}
          tabSwitchCount={tabSwitchCount}
        />
      </div>

      <div className="px-6 py-8 max-w-4xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!cameraReady ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            {status === "denied" ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Camera access is required</h2>
                <p className="text-sm text-gray-600 mb-5">
                  This exam is proctored. Allow camera access in your browser (the camera icon
                  in the address bar), then try again. Your timer is already running.
                </p>
                <button
                  onClick={() => startMonitoring()}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto mb-3" />
                <p className="text-sm text-gray-600">Setting up your camera and proctoring...</p>
                <p className="text-xs text-gray-400 mt-1">
                  Click "Allow" when your browser asks for camera access. Video stays on your device.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <QuestionCard question={q} index={index} answer={answers[q._id] || ""} onAnswer={handleAnswer} />

            <div className="flex items-center justify-between mt-8 gap-4">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>

              <div className="flex flex-wrap justify-center gap-1">
                {questions.map((qq, i) => (
                  <button
                    key={qq._id}
                    onClick={() => setIndex(i)}
                    className={`px-3 py-1 rounded text-sm ${
                      i === index
                        ? "bg-indigo-600 text-white"
                        : answers[qq._id]
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              {isLast ? (
                <button
                  onClick={handleSubmitClick}
                  disabled={submitting}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Exam"}
                </button>
              ) : (
                <button
                  onClick={() => setIndex((i) => i + 1)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Next
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const ExamPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    exam: Exam;
    questions: Question[];
    sessionId: string;
    remaining: number;
  } | null>(null);
  const [error, setError] = useState("");
  const startedRef = useRef(false); // guards React StrictMode's double effect

  useEffect(() => {
    if (!examId || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const { exam, questions } = await studentService.getExam(examId);
        const session = await studentService.startSession(examId);

        const startedAt = new Date(session.started_at).getTime();
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const remaining = Math.max(0, session.duration_minutes * 60 - elapsedSeconds);

        setData({
          exam,
          questions,
          sessionId: session.session_id,
          remaining,
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [examId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => navigate("/student/dashboard")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Preparing your exam...</p>
        </div>
      </div>
    );
  }

  return (
    <ExamRunner
      exam={data.exam}
      questions={data.questions}
      sessionId={data.sessionId}
      remainingSeconds={data.remaining}
    />
  );
};