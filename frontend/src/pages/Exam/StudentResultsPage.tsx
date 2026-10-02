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
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">My Results</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {results.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          You haven't completed any exams yet
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {results.map((r) => (
            <Link
              key={r._id}
              to={`/student/results/${r._id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{r.exam_title}</p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(r.submitted_at || r.started_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">
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