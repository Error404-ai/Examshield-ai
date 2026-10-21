/**
 * Exam Page - student takes the exam
 *
 * Flow:
 *   1. Loader fetches the exam and shows the pre-exam notice.
 *   2. The "Start exam" click enters fullscreen (needs a user gesture) and starts
 *      or resumes the session. The server returns the remaining time and any
 *      answers saved earlier.
 *   3. The runner turns on the webcam + browser proctoring, autosaves answers,
 *      and submits automatically when the timer ends or the tab limit is hit.
 *      A failed automatic submit is retried a few times, then waits for the
 *      student (or for the connection to come back).
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { QuestionCard } from "../../components/exam/QuestionCard";
import { PreExamNotice } from "../../components/exam/PreExamNotice";
import { MAX_TAB_SWITCHES } from "../../services/policy";
import { ProctoringOverlay } from "../../components/proctoring/ProctoringOverlay";
import { useExamTimer } from "../../hooks/useExamTimer";
import { useProctoring } from "../../hooks/useProctoring";
import { Exam, Question, QuestionType, StudentAnswer } from "../../types";
import { getErrorMessage } from "../../utils";

// ─── Constants & helpers ─────────────────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 1500;
const MAX_AUTO_RETRIES = 5;
const retryDelayMs = (attempt: number) => Math.min(30000, 2000 * 2 ** attempt); // 2s, 4s, 8s, 16s, 30s

type SubmitReason = "manual" | "timer" | "tab_limit";
type SubmitState = "idle" | "submitting" | "retrying" | "failed";

const localKey = (sessionId: string) => `examshield:answers:${sessionId}`;

const readLocalAnswers = (sessionId: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(sessionId)) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
};

const writeLocalAnswers = (sessionId: string, answers: Record<string, string>) => {
  try {
    localStorage.setItem(localKey(sessionId), JSON.stringify(answers));
  } catch {
    /* storage full or blocked: the server copy still works */
  }
};

const clearLocalAnswers = (sessionId: string) => {
  try {
    localStorage.removeItem(localKey(sessionId));
  } catch {
    /* ignore */
  }
};

const canRequestFullscreen = () =>
  typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

const Banner: React.FC<{ tone: "info" | "warn" | "error"; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const styles = {
    info: "bg-indigo-50 border-indigo-200 text-indigo-900",
    warn: "bg-yellow-50 border-yellow-200 text-yellow-900",
    error: "bg-red-50 border-red-200 text-red-800",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm mb-4 ${styles}`}>{children}</div>;
};

// ─── Runner ──────────────────────────────────────────────────────────────────

interface RunnerProps {
  exam: Exam;
  questions: Question[];
  sessionId: string;
  remainingSeconds: number;
  resumed: boolean;
  initialAnswers: Record<string, string>;
  initialTabSwitches: number;
}

const ExamRunner: React.FC<RunnerProps> = ({
  exam,
  questions,
  sessionId,
  remainingSeconds,
  resumed,
  initialAnswers,
  initialTabSwitches,
}) => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    ...initialAnswers,
    ...readLocalAnswers(sessionId), // this device's copy can be newer than the server's
  }));
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [reason, setReason] = useState<SubmitReason | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [showResumeNote, setShowResumeNote] = useState(resumed);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  const doneRef = useRef(false);        // submit succeeded
  const inFlightRef = useRef(false);    // a submit request is running
  const forcedRef = useRef<SubmitReason | null>(null); // set once the timer or tab limit forces a submit
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const restoredCount = useRef(Object.keys(answers).length).current;

  // ── Submit (manual, timer, or tab limit) with a bounded retry ──────────────

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    doneRef.current = true;
    clearLocalAnswers(sessionId);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(`/student/results/${sessionId}`, { replace: true });
  }, [sessionId, navigate]);

  const submit = useCallback(
    async (why: SubmitReason = "manual") => {
      if (doneRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      clearRetryTimer();
      if (why !== "manual") forcedRef.current = why;
      setReason((prev) => (prev && prev !== "manual" ? prev : why));
      setSubmitState(attemptsRef.current > 0 ? "retrying" : "submitting");
      setError("");

      try {
        await studentService.submitExam({
          session_id: sessionId,
          answers: Object.entries(answersRef.current).map(([question_id, selected_answer]) => ({
            question_id,
            selected_answer,
          })),
        });
        finish();
      } catch (err) {
        inFlightRef.current = false;
        const status = (err as { response?: { status?: number } })?.response?.status;
        const message = getErrorMessage(err);

        // The first request may have gone through while its reply was lost (offline, timeout)
        if (status === 400 && /already submitted/i.test(message)) {
          finish();
          return;
        }

        // No response at all, or a server error: worth retrying. Anything else won't change.
        const retryable = status === undefined || status >= 500;

        if (retryable && forcedRef.current && attemptsRef.current < MAX_AUTO_RETRIES) {
          const delay = retryDelayMs(attemptsRef.current);
          attemptsRef.current += 1;
          setAttempt(attemptsRef.current);
          setSubmitState("retrying");
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            submitRef.current(forcedRef.current ?? "manual");
          }, delay);
          return;
        }

        setSubmitState("failed");
        setError(
          retryable
            ? "Could not reach the server. Your answers are saved on this device. Check your connection, then press Retry."
            : message
        );
      }
    },
    [sessionId, finish, clearRetryTimer]
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;

  const handleRetry = () => {
    attemptsRef.current = 0;
    setAttempt(0);
    submit(forcedRef.current ?? "manual");
  };

  // When the connection comes back after a forced submit, try again right away
  useEffect(() => {
    const onOnline = () => {
      if (!forcedRef.current || doneRef.current || inFlightRef.current) return;
      clearRetryTimer();
      attemptsRef.current = 0;
      setAttempt(0);
      submitRef.current(forcedRef.current);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [clearRetryTimer]);

  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  const { timeLeft, formattedTime } = useExamTimer(remainingSeconds, () => submit("timer"));

  // The hook counts tab switches (starting from the count saved on the server, so a
  // refresh can't reset it) and calls onTabLimit once when the limit is reached.
  const {
    videoRef,
    start,
    cameraReady,
    cameraError,
    modelState,
    phoneDetectorState,
    faceStatus,
    alerts,
    tabSwitchCount,
    fullscreenSupported,
    isFullscreen,
    enterFullscreen,
  } = useProctoring(sessionId, {
    maxTabSwitches: MAX_TAB_SWITCHES,
    initialTabSwitches,
    onTabLimit: () => submit("tab_limit"),
  });

  // Turn the camera on as soon as the exam opens
  useEffect(() => {
    start();
  }, [start]);

  // ── Autosave: local copy at once, server copy after a short pause ──────────

  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (doneRef.current || forcedRef.current) return;
    writeLocalAnswers(sessionId, answers);
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      studentService.saveAnswers(sessionId, answers).catch(() => {
        /* offline: the local copy is kept and the next change tries again */
      });
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [answers, sessionId]);

  // ── Answers, navigation, unload warning ────────────────────────────────────

  const handleAnswer = (a: StudentAnswer) => {
    if (forcedRef.current) return; // exam is being submitted
    setAnswers((prev) => ({ ...prev, [a.question_id]: a.selected_answer }));
  };

  const handleSubmitClick = () => {
    const unanswered = questions.length - Object.values(answers).filter(Boolean).length;
    const msg =
      unanswered > 0
        ? `You have ${unanswered} unanswered question(s). Submit anyway?`
        : "Submit your exam now?";
    if (window.confirm(msg)) submit("manual");
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!doneRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const locked = reason === "timer" || reason === "tab_limit";
  const busy = submitState === "submitting" || submitState === "retrying";

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
          cameraReady={cameraReady}
          cameraError={cameraError}
          modelState={modelState}
          phoneDetectorState={phoneDetectorState}
          faceStatus={faceStatus}
          alerts={alerts}
          tabSwitchCount={tabSwitchCount}
          maxTabSwitches={MAX_TAB_SWITCHES}
        />
      </div>

      <div className="px-6 py-8 max-w-4xl mx-auto">
        {/* Status banners */}
        {locked ? (
          <Banner tone={submitState === "failed" ? "error" : "warn"}>
            <p className="font-semibold">
              {reason === "timer" ? "Time is up" : `Tab-switch limit reached (${MAX_TAB_SWITCHES})`}
            </p>
            <p className="mt-0.5">
              {submitState === "failed"
                ? error
                : submitState === "retrying"
                ? `Could not reach the server. Retrying automatically (retry ${attempt} of ${MAX_AUTO_RETRIES})...`
                : "Submitting your answers automatically..."}
            </p>
            {submitState === "failed" && (
              <button
                onClick={handleRetry}
                className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Retry
              </button>
            )}
          </Banner>
        ) : submitState === "failed" ? (
          <Banner tone="error">
            <p>{error}</p>
            <button
              onClick={handleRetry}
              className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
            >
              Retry
            </button>
          </Banner>
        ) : null}

        {showResumeNote && !locked && (
          <Banner tone="info">
            <div className="flex items-start justify-between gap-3">
              <p>
                Welcome back. Your timer kept running while you were away
                {restoredCount > 0 ? ` and ${restoredCount} saved answer(s) were restored.` : "."}
              </p>
              <button onClick={() => setShowResumeNote(false)} className="shrink-0 text-indigo-700 hover:underline">
                Dismiss
              </button>
            </div>
          </Banner>
        )}

        {fullscreenSupported && !isFullscreen && !locked && (
          <Banner tone="warn">
            <div className="flex items-center justify-between gap-3">
              <p>This exam is meant to run in fullscreen.</p>
              <button
                onClick={() => void enterFullscreen()}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-yellow-600 text-white text-sm hover:bg-yellow-700"
              >
                Return to fullscreen
              </button>
            </div>
          </Banner>
        )}

        {!cameraReady ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            {cameraError ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Camera access is required</h2>
                <p className="text-sm text-gray-600 mb-5">
                  {cameraError} Your timer is already running.
                </p>
                <button
                  onClick={() => start()}
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
          <div className={locked ? "pointer-events-none opacity-60" : ""} aria-disabled={locked}>
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
                  disabled={busy}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Submitting..." : "Submit Exam"}
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
        )}
      </div>
    </div>
  );
};

// ─── Loader ──────────────────────────────────────────────────────────────────

interface StartedSession {
  sessionId: string;
  remaining: number;
  resumed: boolean;
  savedAnswers: Record<string, string>;
  tabSwitches: number;
}

export const ExamPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [content, setContent] = useState<{ exam: Exam; questions: Question[] } | null>(null);
  const [session, setSession] = useState<StartedSession | null>(null);
  const [loadError, setLoadError] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  // Load the exam only. The session (and its timer) starts after the student accepts the notice.
  useEffect(() => {
    if (!examId) return;
    let active = true;
    setContent(null);
    setLoadError("");
    studentService
      .getExam(examId)
      .then((result) => { if (active) setContent(result); })
      .catch((err) => { if (active) setLoadError(getErrorMessage(err)); });
    return () => { active = false; };
  }, [examId]);

  const handleAccept = async () => {
    if (!examId || starting) return;
    setStarting(true);
    setStartError("");

    // Must run directly inside the click handler: browsers only allow fullscreen after a user gesture
    if (canRequestFullscreen()) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    try {
      const s = await studentService.startSession(examId);
      setSession({
        sessionId: s.session_id,
        remaining: s.remaining_seconds, // server clock, so a wrong device clock can't change the timer
        resumed: Object.keys(s.draft_answers ?? {}).length > 0 || (s.tab_switch_count ?? 0) > 0,
        savedAnswers: s.draft_answers ?? {},
        tabSwitches: s.tab_switch_count ?? 0,
      });
    } catch (err) {
      setStartError(getErrorMessage(err));
      setStarting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-700 mb-4">{loadError}</p>
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

  if (!content) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <PreExamNotice
        exam={content.exam}
        hasWrittenAnswers={content.questions.some(
          (q) =>
            q.question_type === QuestionType.SHORT_ANSWER || q.question_type === QuestionType.ESSAY
        )}
        starting={starting}
        error={startError}
        onAccept={handleAccept}
        onCancel={() => navigate("/student/dashboard")}
      />
    );
  }

  return (
    <ExamRunner
      exam={content.exam}
      questions={content.questions}
      sessionId={session.sessionId}
      remainingSeconds={session.remaining}
      resumed={session.resumed}
      initialAnswers={session.savedAnswers}
      initialTabSwitches={session.tabSwitches}
    />
  );
};
