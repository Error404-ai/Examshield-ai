/**
 * Student Results Page - list of the student's completed exams
 */

import { PageHeader } from "../../components/common/PageHeader";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { studentService } from "../../services/examService";
import { Badge, Alert } from "../../components/common/Badge";
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1500px] px-6 lg:px-12 py-10">
      <PageHeader
        className="mb-8"
        eyebrow="Student"
        title="My results"
        subtitle="Every exam you have finished, newest first."
      />

      {error && (
        <div className="mb-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {results.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center border-y border-gray-200 px-6 text-center text-gray-600">
          You haven&rsquo;t completed any exams yet.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 border-y border-gray-200">
          {results.map((r) => (
            <li key={r._id}>
              <Link
                to={`/student/results/${r._id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{r.exam_title}</p>
                  <p className="text-sm text-gray-500">{formatDateTime(r.submitted_at || r.started_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-gray-700">
                    {r.score}/{r.total_marks} ({r.percentage.toFixed(1)}%)
                  </span>
                  <Badge variant={r.passed ? "success" : "error"}>{r.passed ? "Passed" : "Failed"}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};