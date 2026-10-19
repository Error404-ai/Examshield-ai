/**
 * Result Page - View exam results
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Button } from "../../components/common/Button";
import { Badge, Alert } from "../../components/common/Badge";
import { formatDateTime, getScoreColor, getScoreGrade, getErrorMessage } from "../../utils";
import { ExamResult } from "../../types";

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {error && (
        <div className="mb-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/* Score */}
      <header className="border-b border-gray-200 pb-8">
        <h1 className="font-display text-3xl font-semibold text-gray-900">{result.exam_title || "Exam result"}</h1>
        <p className="mt-1 text-gray-500">{formatDateTime(result.submitted_at || result.started_at)}</p>

        <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-4">
          <p className="font-display tabular-nums">
            <span className={`text-6xl font-semibold ${getScoreColor(result.percentage)}`}>{result.score}</span>
            <span className="ml-2 text-2xl text-gray-400">/ {result.total_marks}</span>
          </p>
          <div className="flex items-center gap-3 pb-1.5">
            <span className="text-lg tabular-nums text-gray-700">{result.percentage.toFixed(1)}%</span>
            <span className={`font-display text-2xl font-semibold ${getScoreColor(result.percentage)}`}>
              {getScoreGrade(result.percentage)}
            </span>
            <Badge variant={result.passed ? "success" : "error"}>{result.passed ? "Passed" : "Failed"}</Badge>
          </div>
        </div>
      </header>

      {/* Answer review */}
      {result.answers && result.answers.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl font-semibold text-gray-900">Answer review</h2>

          <ol className="divide-y divide-gray-200">
            {result.answers.map((answer, index) => {
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

                  <dl className="mt-3 space-y-2 text-sm">
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
        </section>
      )}

      <div className="mt-10 flex gap-3 print:hidden">
        <Button onClick={() => navigate("/student/dashboard")} variant="secondary">
          Back to dashboard
        </Button>
        {result.submitted_at && (
          <Button onClick={() => window.print()} variant="secondary">
            Print result
          </Button>
        )}
      </div>
    </div>
  );
};