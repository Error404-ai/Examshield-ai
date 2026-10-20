/**
 * Result Page - View exam results
 * Wide layout: sticky score summary on the left, full answer review on the right.
 * If an examiner confirmed a proctoring flag, the notice (and appeal form) sits above the review.
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CountUp, Reveal } from "../../components/common/Motion";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Button } from "../../components/common/Button";
import { Badge, Alert } from "../../components/common/Badge";
import { IntegrityNotice } from "../../components/exam/IntegrityNotice";
import { formatDateTime, getScoreColor, getScoreGrade, getErrorMessage } from "../../utils";
import { ExamResult } from "../../types";

const ScoreRing: React.FC<{ pct: number; passed: boolean }> = ({ pct, passed }) => {
  const r = 44;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
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
          className={passed ? "stroke-green-600" : "stroke-red-500"}
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

  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadResult = async () => {
      if (!sessionId) return;
      try {
        setLoading(true);
        const resultData = await studentService.getResultDetail(sessionId);
        setResult(resultData);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [sessionId]);

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

  const answers = result.answers ?? [];
  const correctCount = answers.filter((a) => a.is_correct).length;

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
              <ScoreRing pct={result.percentage} passed={result.passed} />
              <div>
                <p className="font-display tabular-nums">
                  <span className={`text-5xl font-medium ${getScoreColor(result.percentage)}`}>{result.score}</span>
                  <span className="ml-1.5 text-xl text-gray-400">/ {result.total_marks}</span>
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className={`font-display text-xl font-semibold ${getScoreColor(result.percentage)}`}>
                    {getScoreGrade(result.percentage)}
                  </span>
                  <Badge variant={result.passed ? "success" : "error"}>{result.passed ? "Passed" : "Failed"}</Badge>
                </div>
              </div>
            </div>

            {answers.length > 0 && (
              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-gray-200 pt-5 text-sm">
                <div>
                  <dt className="text-gray-500">Correct</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-green-700">
                    {correctCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Wrong</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-red-700">
                    {answers.length - correctCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Total</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-gray-900">
                    {answers.length}
                  </dd>
                </div>
              </dl>
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

          <h2 className="mb-2 border-b border-gray-200 pb-2 font-display text-xl font-semibold text-gray-900">
            Answer review
          </h2>

          {answers.length === 0 ? (
            <p className="py-10 text-center text-gray-500">No answer details are available for this exam.</p>
          ) : (
            <ol className="divide-y divide-gray-200">
              {answers.map((answer, index) => {
                const answerMeta = answer as {
                  question_text?: string;
                  marks?: number;
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

                return (
                  <li
                    key={answer.question_id || index}
                    className={`border-l-2 py-5 pl-5 ${answer.is_correct ? "border-green-600" : "border-red-500"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium text-gray-900">
                        {index + 1}. {questionText}
                      </p>
                      <span className="shrink-0 text-sm tabular-nums text-gray-500">
                        {answer.marks_awarded} / {answerMeta.marks ?? "—"}
                      </span>
                    </div>

                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-gray-500">Your answer</dt>
                        <dd className={`font-medium ${answer.is_correct ? "text-green-700" : "text-red-700"}`}>
                          {answer.selected_answer || "Not answered"}
                        </dd>
                      </div>
                      {!answer.is_correct && (
                        <div>
                          <dt className="text-gray-500">Correct answer</dt>
                          <dd className="font-medium text-green-700">{answer.correct_answer}</dd>
                        </div>
                      )}
                    </dl>
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
