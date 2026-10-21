/**
 * Result Page - View exam results
 * Wide layout: sticky score summary on the left, full answer review on the right.
 * If an examiner confirmed a proctoring flag, the notice (and appeal form) sits above the review.
 *
 * Written answers are scored by AI after submission. While that runs the score is
 * provisional (multiple choice only) and the page refreshes itself until it is done.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CountUp, Reveal } from "../../components/common/Motion";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Button } from "../../components/common/Button";
import { Badge, Alert } from "../../components/common/Badge";
import { IntegrityNotice } from "../../components/exam/IntegrityNotice";
import { formatDateTime, getScoreColor, getScoreGrade, getErrorMessage } from "../../utils";
import { ExamResult, GradedAnswer } from "../../types";

type GradingStatus = "pending" | "done" | "failed";
type ResultWithGrading = ExamResult & { grading_status?: GradingStatus };
type AnswerWithGrading = GradedAnswer & {
  question_type?: string;
  grading?: "none" | "pending" | "ai" | "manual" | "failed";
  feedback?: string;
  examiner_note?: string;
};

const POLL_MS = 5000;
const MAX_POLLS = 60;

const isWritten = (a: AnswerWithGrading) =>
  a.question_type === "short_answer" || a.question_type === "essay";

const ScoreRing: React.FC<{ pct: number; passed: boolean; provisional?: boolean }> = ({
  pct,
  passed,
  provisional,
}) => {
  const r = 44;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const stroke = provisional ? "stroke-indigo-500" : passed ? "stroke-green-600" : "stroke-red-500";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="7" className="stroke-gray-200" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={stroke}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-medium tabular-nums text-gray-900">
          <CountUp value={`${Math.round(clamped)}%`} duration={1.1} />
        </span>
      </div>
    </div>
  );
};

export const ResultPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [result, setResult] = useState<ResultWithGrading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const polls = useRef(0);

  // silent = background refresh while grading: no spinner, errors are ignored
  const fetchResult = useCallback(
    async (silent = false) => {
      if (!sessionId) return;
      try {
        if (!silent) setLoading(true);
        const data = await studentService.getResultDetail(sessionId);
        setResult(data as ResultWithGrading);
      } catch (err) {
        if (!silent) setError(getErrorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  // While the AI is still grading, check again every few seconds
  useEffect(() => {
    if (result?.grading_status !== "pending") {
      polls.current = 0;
      return;
    }
    const id = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > MAX_POLLS) {
        window.clearInterval(id);
        return;
      }
      fetchResult(true);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [result?.grading_status, fetchResult]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading results</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="text-center">
          <p className="mb-4 text-gray-600">{error || "Result not found"}</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  const answers = (result.answers ?? []) as AnswerWithGrading[];
  const gradingStatus = result.grading_status;
  const provisional = gradingStatus === "pending" || gradingStatus === "failed";

  const isPending = (a: AnswerWithGrading) => a.grading === "pending" || a.grading === "failed";
  const isPartial = (a: AnswerWithGrading) =>
    !a.is_correct && !isPending(a) && a.marks_awarded > 0 && a.marks_awarded < a.marks;

  const correctCount = answers.filter((a) => a.is_correct).length;
  const partialCount = answers.filter(isPartial).length;
  const waitingCount = answers.filter(isPending).length;
  const wrongCount = answers.length - correctCount - partialCount - waitingCount;
  const hasAiMarks = answers.some((a) => a.grading === "ai");

  return (
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1500px] px-6 lg:px-12 py-10">
      {error && (
        <div className="mb-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Score summary */}
        <Reveal className="lg:sticky lg:top-20 lg:self-start">
          <div className="border-t border-gray-300 pt-6">
            <h1 className="font-display text-2xl font-medium text-gray-900">
              {result.exam_title || "Exam result"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{formatDateTime(result.submitted_at || result.started_at)}</p>

            <div className="mt-6 flex items-center gap-5">
              <ScoreRing pct={result.percentage} passed={result.passed} provisional={provisional} />
              <div>
                <p className="font-display tabular-nums">
                  <span
                    className={`text-5xl font-medium ${provisional ? "text-gray-900" : getScoreColor(result.percentage)}`}
                  >
                    {result.score}
                  </span>
                  <span className="ml-1.5 text-xl text-gray-400">/ {result.total_marks}</span>
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  {provisional ? (
                    <Badge variant="warning">Provisional</Badge>
                  ) : (
                    <>
                      <span className={`font-display text-xl font-semibold ${getScoreColor(result.percentage)}`}>
                        {getScoreGrade(result.percentage)}
                      </span>
                      <Badge variant={result.passed ? "success" : "error"}>
                        {result.passed ? "Passed" : "Failed"}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>

            {answers.length > 0 && (
              <>
                <dl className="mt-6 grid grid-cols-4 gap-3 border-t border-gray-200 pt-5 text-sm">
                  <div>
                    <dt className="text-gray-500">Correct</dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-green-700">
                      {correctCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Partial</dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-amber-700">
                      {partialCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Wrong</dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-red-700">
                      {wrongCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Total</dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-gray-900">
                      {answers.length}
                    </dd>
                  </div>
                </dl>
                {waitingCount > 0 && (
                  <p className="mt-2 text-xs text-gray-500">{waitingCount} answer(s) not graded yet.</p>
                )}
              </>
            )}

            <div className="mt-6 flex flex-col gap-2 print:hidden">
              <Button onClick={() => navigate("/student/dashboard")} variant="secondary" className="w-full">
                Back to dashboard
              </Button>
              {result.submitted_at && (
                <Button onClick={() => window.print()} variant="secondary" className="w-full">
                  Print result
                </Button>
              )}
            </div>
          </div>
        </Reveal>

        {/* Integrity notice + answer review */}
        <Reveal delay={0.15}>
        <section>
          <IntegrityNotice sessionId={result._id} />

          {gradingStatus === "pending" && (
            <div className="mb-6 border-l-2 border-indigo-500 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
              Your written answers are being graded. The score so far counts multiple-choice answers only.
              This page updates by itself.
            </div>
          )}
          {gradingStatus === "failed" && (
            <div className="mb-6 border-l-2 border-amber-500 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              Automatic grading did not finish. Your examiner will mark your written answers, and your score
              will update.
            </div>
          )}

          <h2 className="mb-2 border-b border-gray-200 pb-2 font-display text-xl font-semibold text-gray-900">
            Answer review
          </h2>

          {hasAiMarks && gradingStatus !== "pending" && (
            <p className="mb-2 mt-3 text-sm text-gray-500">
              Written answers are scored by AI and can be reviewed by your examiner.
            </p>
          )}

          {answers.length === 0 ? (
            <p className="py-10 text-center text-gray-500">No answer details are available for this exam.</p>
          ) : (
            <ol className="divide-y divide-gray-200">
              {answers.map((answer, index) => {
                const answerMeta = answer as AnswerWithGrading & {
                  question?: {
                    text?: string;
                    question_text?: string;
                  };
                };

                const questionText =
                  answerMeta.question_text ??
                  answerMeta.question?.text ??
                  answerMeta.question?.question_text ??
                  `Question ${index + 1}`;

                const written = isWritten(answer);
                const waiting = isPending(answer);
                const partial = isPartial(answer);
                const tone = waiting
                  ? { border: "border-gray-300", text: "text-gray-700" }
                  : answer.is_correct
                  ? { border: "border-green-600", text: "text-green-700" }
                  : partial
                  ? { border: "border-amber-500", text: "text-amber-700" }
                  : { border: "border-red-500", text: "text-red-700" };

                return (
                  <li key={answer.question_id || index} className={`border-l-2 py-5 pl-5 ${tone.border}`}>
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium text-gray-900">
                        {index + 1}. {questionText}
                      </p>
                      <span className="shrink-0 text-sm tabular-nums text-gray-500">
                        {waiting ? "—" : answer.marks_awarded} / {answerMeta.marks ?? "—"}
                      </span>
                    </div>

                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-gray-500">Your answer</dt>
                        <dd className={`font-medium ${tone.text} ${written ? "whitespace-pre-wrap break-words" : ""}`}>
                          {answer.selected_answer || "Not answered"}
                        </dd>
                      </div>
                      {!answer.is_correct && !waiting && (
                        <div>
                          <dt className="text-gray-500">{written ? "Model answer" : "Correct answer"}</dt>
                          <dd
                            className={`font-medium text-green-700 ${written ? "whitespace-pre-wrap break-words" : ""}`}
                          >
                            {answer.correct_answer}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {written && (
                      <div className="mt-3 flex flex-col gap-1 text-sm text-gray-700">
                        {answer.grading === "pending" && (
                          <p className="text-gray-500">Waiting for AI grading.</p>
                        )}
                        {answer.grading === "failed" && (
                          <p className="text-gray-500">Not graded yet. Your examiner will mark this answer.</p>
                        )}
                        {answer.feedback && (
                          <p>
                            <span className="font-medium">Feedback: </span>
                            {answer.feedback}
                            {answer.grading === "ai" && (
                              <span className="ml-2 text-xs text-gray-500">AI-graded</span>
                            )}
                          </p>
                        )}
                        {answer.grading === "manual" && (
                          <p>
                            <span className="font-medium">Marked by your examiner.</span>
                            {answer.examiner_note ? ` ${answer.examiner_note}` : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        </Reveal>
      </div>
    </div>
  );
};