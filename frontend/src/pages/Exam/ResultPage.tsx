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
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error || "Result not found"}</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Score Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{result.exam_title || "Exam Result"}</h1>
        <p className="text-gray-500 mb-6">{formatDateTime(result.submitted_at || result.started_at)}</p>

        <div className="inline-flex items-baseline gap-2 mb-6">
          <span className={`text-6xl font-bold ${getScoreColor(result.percentage)}`}>{result.score}</span>
          <span className="text-2xl text-gray-600">/ {result.total_marks}</span>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <Badge variant={result.passed ? "success" : "error"}>
            {result.percentage.toFixed(1)}%
          </Badge>
          <div className={`text-3xl font-bold ${getScoreColor(result.percentage)}`}>
            {getScoreGrade(result.percentage)}
          </div>
        </div>

        <Badge variant={result.passed ? "success" : "error"}>
          {result.passed ? "PASSED ✓" : "FAILED"}
        </Badge>
      </div>

      {/* Answer Review */}
      {result.answers && result.answers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Answer Review</h2>

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
                  className={`border-l-4 p-4 rounded ${
                    answer.is_correct ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-medium text-gray-900">
                      {index + 1}. {questionText}
                    </p>
                    <Badge variant={answer.is_correct ? "success" : "error"}>
                      {answer.marks_awarded} / {answerMeta.marks ?? "—"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-gray-600">Your Answer:</p>
                      <p className={`font-medium ${answer.is_correct ? "text-green-700" : "text-red-700"}`}>
                        {answer.selected_answer || "(Not answered)"}
                      </p>
                    </div>

                    {!answer.is_correct && (
                      <div>
                        <p className="text-gray-600">Correct Answer:</p>
                        <p className="font-medium text-green-700">{answer.correct_answer}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-4 justify-center">
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