/**
 * Exam Page - student takes the exam
 * Flow: intro/rules screen -> start or resume session -> proctored exam runner.
 * The timer only mounts once the real remaining time is known.
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

const MAX_TAB_SWITCHES = 5;

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

  const proctor = useProctoring(sessionId);
  const { start: startProctoring, stop: stopProctoring } = proctor;

  // Start camera + AI as soon as the exam screen is up
  useEffect(() => {
    startProctoring();
  }, [startProctoring]);

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
      stopProctoring();
      navigate(`/student/results/${sessionId}`, { replace: true });
    } catch (err) {
      submittedRef.current = false;
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, navigate, stopProctoring]);

  const { timeLeft, formattedTime } = useExamTimer(remainingSeconds, submit);

  // Too many tab switches -> auto-submit
  useEffect(() => {
    if (proctor.tabSwitchCount >= MAX_TAB_SWITCHES) submit();
  }, [proctor.tabSwitchCount, submit]);

  const handleAnswer = (a: StudentAnswer) =>
    setAnswers((prev) => ({ ...prev, [a.question_id]: a.selected_answer }));

  const handleSubmitClick = () => {
    const unanswered = questions.length - Object.keys(answers).length;
    const msg =
      unanswered > 0
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
          <div
            className={`text-2xl font-bold tabular-nums ${
              timeLeft < 300 ? "text-red-600" : "text-gray-900"
            }`}
          >
            {formattedTime}
          </div>
        </div>
      </div>

      <div className="px-6 py-8 max-w-4xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <QuestionCard
          question={q}
          index={index}
          answer={answers[q._id] || ""}
          onAnswer={handleAnswer}
        />

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
      </div>

      <ProctoringOverlay
        videoRef={proctor.videoRef}
        cameraReady={proctor.cameraReady}
        modelState={proctor.modelState}
        faceStatus={proctor.faceStatus}
        alerts={proctor.alerts}
        tabSwitchCount={proctor.tabSwitchCount}
        maxTabSwitches={MAX_TAB_SWITCHES}
      />

      {proctor.cameraError && (
        <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Camera required</h2>
            <p className="text-sm text-gray-600 mb-4">{proctor.cameraError}</p>
            <button
              onClick={() => startProctoring()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Retry camera
            </button>
            <p className="text-xs text-gray-400 mt-3">The exam timer keeps running.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const ExamPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [begun, setBegun] = useState(false);
  const [data, setData] = useState<{
    exam: Exam;
    questions: Question[];
    sessionId: string;
    remaining: number;
  } | null>(null);
  const [error, setError] = useState("");
  const startedRef = useRef(false); // guards React StrictMode's double effect

  // Runs only after the student accepts the rules
  useEffect(() => {
    if (!examId || !begun || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const { exam, questions } = await studentService.getExam(examId);
        const session = await studentService.startSession(examId);

        const startedAt = new Date(session.started_at).getTime();
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const remaining = Math.max(0, session.duration_minutes * 60 - elapsedSeconds);

        setData({ exam, questions, sessionId: session.session_id, remaining });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [examId, begun]);

  const handleBegin = () => {
    // Must be called directly from the click to be allowed by the browser
    Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => {});
    setBegun(true);
  };

  if (!begun) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-lg w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Proctored exam</h1>
          <p className="text-sm text-gray-500 mb-5">Read these rules before you begin.</p>

          <ul className="text-sm text-gray-700 space-y-2 mb-6 list-disc pl-5">
            <li>Your webcam must stay on. Keep your face visible and stay alone in the frame.</li>
            <li>The exam runs in fullscreen. Leaving fullscreen is reported.</li>
            <li>
              Switching tabs is reported. After {MAX_TAB_SWITCHES} switches the exam is submitted
              automatically.
            </li>
            <li>
              Face checks run on your device. Your video is not uploaded or stored; only short
              event notes (like “looked away”) are sent to your examiner.
            </li>
            <li>The timer starts as soon as you press the button below.</li>
          </ul>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/student/dashboard")}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleBegin}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              I agree, start exam
            </button>
          </div>
        </div>
      </div>
    );
  }

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