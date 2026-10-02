/**
 * Exam Results Page (admin)
 * Stats and per-student results for one exam
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { formatDateTime, getErrorMessage } from "../../utils";

type ResultsData = Awaited<ReturnType<typeof adminService.getExamResults>>;

export const ExamResultsPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!examId) return;
    adminService
      .getExamResults(examId)
      .then(setData)
      .catch((e) => setError(getErrorMessage(e)));
  }, [examId]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-red-700">{error}</p>
        <Button variant="secondary" onClick={() => navigate("/admin/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const stat = (label: string, value: string | number) => (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-indigo-600 mt-1">{value}</p>
    </div>
  );

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{data.exam_title}: Results</h1>
        <Button variant="secondary" onClick={() => navigate("/admin/dashboard")}>
          Back
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stat("Attempts", data.total_attempts)}
        {stat("Passed", data.passed)}
        {stat("Failed", data.failed)}
        {stat("Average", `${data.average_score}%`)}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.results.map((r) => (
              <tr key={r._id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{r.student_name}</p>
                  <p className="text-xs text-gray-500">{r.student_email}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {r.score}/{r.total_marks} ({r.percentage.toFixed(1)}%)
                </td>
                <td className="px-4 py-3">
                  <Badge variant={r.passed ? "success" : "error"}>
                    {r.passed ? "Passed" : "Failed"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {r.submitted_at ? formatDateTime(r.submitted_at) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.results.length === 0 && (
          <p className="p-6 text-center text-gray-500">No submissions yet</p>
        )}
      </div>
    </div>
  );
};