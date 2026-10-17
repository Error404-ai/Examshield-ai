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
import { Button } from "../../components/common/Button";
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
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-navy-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-50">{exam.title}</h1>
            <p className="text-sm text-slate-400">
              Question {index + 1} of {questions.length}
            </p>
          </div>
          <div
            className={`font-display text-2xl font-bold tabular-nums ${
              timeLeft < 300 ? "text-rose-400" : "text-slate-100"
            }`}
          >
            {formattedTime}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="glass-rose mb-6 rounded-xl p-4">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        <QuestionCard
          question={q}
          index={index}
          answer={answers[q._id] || ""}
          onAnswer={handleAnswer}
        />

        <div className="mt-8 flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            Previous
          </Button>

          <div className="flex flex-wrap justify-center gap-1">
            {questions.map((qq, i) => (
              <button
                key={qq._id}
                onClick={() => setIndex(i)}
                className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                  i === index
                    ? "bg-violet text-white"
                    : answers[qq._id]
                    ? "bg-emerald/15 text-emerald-300"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {isLast ? (
            <Button onClick={handleSubmitClick} loading={submitting}>
              Submit Exam
            </Button>
          ) : (
            <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
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
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-strong max-w-md rounded-2xl bg-navy-800 p-6 text-center">
            <h2 className="mb-2 font-display text-lg font-bold text-slate-50">Camera required</h2>
            <p className="mb-4 text-sm text-slate-400">{proctor.cameraError}</p>
            <Button onClick={() => startProctoring()}>Retry camera</Button>
            <p className="mt-3 text-xs text-slate-500">The exam timer keeps running.</p>
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-grid p-4">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-violet/25 blur-3xl" />
        <div className="glass-strong relative w-full max-w-lg rounded-2xl p-8 shadow-glass-lg">
          <h1 className="mb-1 font-display text-2xl font-bold text-slate-50">Proctored exam</h1>
          <p className="mb-5 text-sm text-slate-400">Read these rules before you begin.</p>

          <ul className="mb-6 list-disc space-y-2 pl-5 text-sm text-slate-300">
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
            <Button variant="secondary" className="flex-1" onClick={() => navigate("/student/dashboard")}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleBegin}>
              I agree, start exam
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-rose-300">{error}</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet border-t-transparent" />
          <p className="text-sm text-slate-400">Preparing your exam...</p>
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