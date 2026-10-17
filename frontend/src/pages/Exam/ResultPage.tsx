/**
 * Result Page - View exam results
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet border-t-transparent" />
          <p className="text-sm text-slate-400">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-slate-400">{error || "Result not found"}</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {error && (
        <div className="glass-rose mb-6 rounded-xl p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {/* Score Card */}
      <div className="glass-strong mb-6 rounded-2xl p-8 text-center shadow-glass-lg">
        <h1 className="mb-2 font-display text-3xl font-bold text-slate-50">
          {result.exam_title || "Exam Result"}
        </h1>
        <p className="mb-6 text-slate-400">{formatDateTime(result.submitted_at || result.started_at)}</p>

        <div className="mb-6 inline-flex items-baseline gap-2">
          <span className={`font-display text-6xl font-bold ${getScoreColor(result.percentage)}`}>
            {result.score}
          </span>
          <span className="text-2xl text-slate-500">/ {result.total_marks}</span>
        </div>

        <div className="mb-6 flex items-center justify-center gap-4">
          <Badge variant={result.passed ? "success" : "error"}>{result.percentage.toFixed(1)}%</Badge>
          <div className={`font-display text-3xl font-bold ${getScoreColor(result.percentage)}`}>
            {getScoreGrade(result.percentage)}
          </div>
        </div>

        <Badge variant={result.passed ? "success" : "error"}>
          {result.passed ? "PASSED ✓" : "FAILED"}
        </Badge>
      </div>

      {/* Answer Review */}
      {result.answers && result.answers.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-slate-100">Answer Review</h2>

          <div className="space-y-4">
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
                <div
                  key={answer.question_id || index}
                  className={`rounded-xl border-l-4 p-4 ${
                    answer.is_correct
                      ? "border-emerald bg-emerald/5"
                      : "border-rose bg-rose/5"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-100">
                      {index + 1}. {questionText}
                    </p>
                    <Badge variant={answer.is_correct ? "success" : "error"}>
                      {answer.marks_awarded} / {answerMeta.marks ?? "—"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-slate-500">Your Answer:</p>
                      <p
                        className={`font-medium ${
                          answer.is_correct ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {answer.selected_answer || "(Not answered)"}
                      </p>
                    </div>

                    {!answer.is_correct && (
                      <div>
                        <p className="text-slate-500">Correct Answer:</p>
                        <p className="font-medium text-emerald-400">{answer.correct_answer}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-center gap-4">
        <Button onClick={() => navigate("/student/dashboard")} variant="secondary">
          Back to Dashboard
        </Button>
        {result.submitted_at && (
          <Button onClick={() => window.print()} variant="secondary">
            Print Result
          </Button>
        )}
      </div>
    </div>
  );
};