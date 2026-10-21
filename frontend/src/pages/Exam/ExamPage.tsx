/**
 * Exam Page - student takes the exam
 * Loader (fetch + start/resume session) is split from the runner so the
 * timer only mounts once the real remaining time is known.
 *
 * Runner flow (matches the contract documented in useProctoring):
 *  1. Start screen. Clicking "Start exam" goes fullscreen (needs a click) and
 *     turns the camera on.
 *  2. Questions stay hidden until the camera works.
 *  3. If the student leaves fullscreen, a "Return to fullscreen" screen blocks
 *     the questions until they click it.
 *
 * Layout: sticky bar with the timer, a reading column for the question, and a
 * sidebar with the camera, question navigator and submit.
 */

import { motion } from "framer-motion";
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

// The browser submits the exam automatically after this many tab switches.
// The server records the switches and flags the session when the limit is hit
// (MAX_TAB_SWITCHES in backend/app/routes/proctoring.py, keep the two equal),
// but it does not submit for the student: the submit itself happens here.
const MAX_TAB_SWITCHES = 3;

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
  const [started, setStarted] = useState(false);
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
  } = useProctoring(sessionId, { maxTabSwitches: MAX_TAB_SWITCHES, onTabLimit: submit });

  // Must run inside a click handler: browsers only allow fullscreen from one
  const handleStart = async () => {
    await enterFullscreen();
    setStarted(true);
    void start();
  };

  const handleAnswer = (a: StudentAnswer) =>
    setAnswers((prev) => ({ ...prev, [a.question_id]: a.selected_answer }));

  const answeredCount = Object.values(answers).filter((v) => v && v.trim()).length;

  const handleSubmitClick = () => {
    const unanswered = questions.length - answeredCount;
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
  const canAnswer = started && cameraReady;
  const needsFullscreen = started && fullscreenSupported && !isFullscreen && !submitting;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Title + timer */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="flex h-14 items-center justify-between gap-4 px-6 lg:px-10">
          <h1 className="truncate font-display text-base font-semibold text-gray-900">{exam.title}</h1>
          <div
            role="timer"
            aria-label="Time remaining"
            className={`font-display text-xl font-semibold tabular-nums ${
              timeLeft < 300 ? "text-red-600" : "text-gray-900"
            }`}
          >
            {formattedTime}
          </div>
        </div>
        <div className="h-0.5 bg-gray-100" aria-hidden>
          <motion.div
            className="h-full bg-indigo-600"
            animate={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Question column: content on top, navigation pinned to the bottom */}
        <main className="flex flex-col px-6 py-8 lg:px-14 lg:py-12">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            {error && (
              <div role="alert" className="mb-6 border-l-2 border-red-500 bg-red-50/70 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {!started ? (
              <div className="my-auto border-t border-gray-300 pt-10">
                <h2 className="font-display text-2xl font-semibold text-gray-900">Before you begin</h2>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-600">
                  This exam is proctored. When you start, it opens in fullscreen and your camera turns on. Video
                  stays on your device and only short event records are sent. Leaving the tab or fullscreen is
                  recorded, and the exam is submitted automatically after {MAX_TAB_SWITCHES} tab switches.
                </p>
                <dl className="mt-6 grid max-w-xl grid-cols-3 gap-4 border-t border-gray-200 pt-6 text-sm">
                  <div>
                    <dt className="text-gray-500">Questions</dt>
                    <dd className="mt-1 font-display text-xl font-semibold tabular-nums text-gray-900">
                      {questions.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Time left</dt>
                    <dd className="mt-1 font-display text-xl font-semibold tabular-nums text-gray-900">
                      {formattedTime}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Total marks</dt>
                    <dd className="mt-1 font-display text-xl font-semibold tabular-nums text-gray-900">
                      {exam.total_marks}
                    </dd>
                  </div>
                </dl>
                <p className="mt-6 text-sm text-gray-600">Your timer has already started.</p>
                <Button className="mt-4" size="lg" onClick={handleStart}>
                  Start exam
                </Button>
              </div>
            ) : !cameraReady ? (
              <div className="my-auto border-t border-gray-300 pt-10">
                {cameraError ? (
                  <>
                    <h2 className="font-display text-2xl font-semibold text-gray-900">Camera access is required</h2>
                    <p className="mt-2 max-w-md text-base leading-relaxed text-gray-600">
                      {cameraError} You can find the camera icon in your browser&rsquo;s address bar.
                    </p>
                    <Button className="mt-5" onClick={handleStart}>
                      Try again
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <p className="text-base text-gray-700">Setting up your camera.</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Click &ldquo;Allow&rdquo; when your browser asks for camera access.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <motion.div
                    key={q._id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <QuestionCard question={q} index={index} answer={answers[q._id] || ""} onAnswer={handleAnswer} />
                  </motion.div>
                </div>

                <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={index === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-sm tabular-nums text-gray-500">
                    {index + 1} of {questions.length}
                  </span>
                  <Button size="lg" onClick={() => setIndex((i) => i + 1)} disabled={isLast}>
                    Next
                  </Button>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Sidebar: full-height panel, submit pinned to the bottom */}
        <aside className="flex flex-col gap-8 border-t border-gray-200 bg-white px-6 py-8 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
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

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-sm font-semibold text-gray-900">Questions</h2>
              <span className="text-xs tabular-nums text-gray-500">
                {answeredCount} of {questions.length} answered
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {questions.map((qq, i) => {
                const answered = !!(answers[qq._id] && answers[qq._id].trim());
                const current = i === index;
                return (
                  <button
                    key={qq._id}
                    type="button"
                    onClick={() => setIndex(i)}
                    disabled={!canAnswer}
                    aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
                    aria-current={current ? "true" : undefined}
                    className={`h-10 rounded-md border text-sm tabular-nums transition-colors disabled:opacity-50 ${
                      current
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : answered
                        ? "border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <Button onClick={handleSubmitClick} loading={submitting} disabled={!started} className="mt-auto w-full" size="lg">
            Submit exam
          </Button>
        </aside>
      </div>

      {/* Blocks the exam until the student returns to fullscreen */}
      {needsFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fs-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50/95 px-6"
        >
          <div className="max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
            <h2 id="fs-title" className="font-display text-xl font-semibold text-gray-900">
              Return to fullscreen
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              The exam must stay in fullscreen. Leaving it has been recorded. Your timer is still running.
            </p>
            <Button className="mt-6" size="lg" onClick={() => void enterFullscreen()}>
              Return to fullscreen
            </Button>
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
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <p className="mb-4 text-red-700">{error}</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Preparing your exam</p>
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