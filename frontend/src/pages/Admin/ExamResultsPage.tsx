/**
 * Exam Results Page (admin)
 * Stats and per-student results for one exam
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ALERT_TYPE_LABEL } from "../../services/integrityService";
import { ExamAlert, proctoringService } from "../../services/proctoringService";
import { formatDateTime, getErrorMessage } from "../../utils";

type ResultsData = Awaited<ReturnType<typeof adminService.getExamResults>>;

export const ExamResultsPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState<ExamAlert[]>([]);
  const [alertsError, setAlertsError] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(true);

  useEffect(() => {
    if (!examId) return;
    adminService
      .getExamResults(examId)
      .then(setData)
      .catch((e) => setError(getErrorMessage(e)));
    proctoringService
      .getExamAlerts(examId)
      .then(setAlerts)
      .catch((e) => setAlertsError(getErrorMessage(e)))
      .finally(() => setAlertsLoading(false));
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
    <div className="mx-auto max-w-5xl px-6 py-8">
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
              <tr
                key={r._id}
                onClick={() => navigate(`/admin/sessions/${r._id}/review`)}
                className="cursor-pointer hover:bg-gray-50"
                title="Review this attempt"
              >
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

      <section className="mt-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-gray-900">Recent exam alerts</h2>
          <p className="mt-1 text-sm text-gray-600">
            Latest proctoring events recorded across attempts for this exam.
          </p>
        </div>
        {alertsError ? (
          <p role="alert" className="px-5 py-6 text-sm text-red-700">{alertsError}</p>
        ) : alertsLoading ? (
          <div className="flex justify-center py-8" aria-label="Loading exam alerts">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : alerts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-600">
            No proctoring alerts have been recorded for this exam yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {alerts.map((alert, index) => {
              const severityColor: Record<string, string> = {
                low: "bg-sky-500",
                medium: "bg-amber-500",
                high: "bg-orange-500",
                critical: "bg-rose-500",
              };
              return (
                <li key={`${alert.session_id}-${alert.timestamp}-${index}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/sessions/${alert.session_id}/review`)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50"
                    title={`Review ${alert.student_name}'s attempt`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityColor[alert.severity] ?? "bg-gray-400"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-900">
                        {alert.description || ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-600">
                        <span>{ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{alert.severity}</span>
                        <span aria-hidden="true">·</span>
                        <span>{alert.student_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDateTime(alert.timestamp)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-indigo-700">Review</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
