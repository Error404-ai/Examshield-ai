/**
 * Student Results Page - list of the student's completed exams
 */

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Badge } from "../../components/common/Badge";
import { ExamResult } from "../../types";
import { formatDateTime, getErrorMessage } from "../../utils";

export const StudentResultsPage: React.FC = () => {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    studentService
      .getMyResults()
      .then(setResults)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold text-slate-50">My Results</h1>

      {error && (
        <div className="glass-rose mb-6 rounded-xl p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {results.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-slate-400">
          You haven't completed any exams yet
        </div>
      ) : (
        <div className="glass divide-y divide-white/10 overflow-hidden rounded-2xl">
          {results.map((r) => (
            <Link
              key={r._id}
              to={`/student/results/${r._id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/5"
            >
              <div>
                <p className="font-medium text-slate-100">{r.exam_title}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(r.submitted_at || r.started_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300">
                  {r.score}/{r.total_marks} ({r.percentage.toFixed(1)}%)
                </span>
                <Badge variant={r.passed ? "success" : "error"}>
                  {r.passed ? "Passed" : "Failed"}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
