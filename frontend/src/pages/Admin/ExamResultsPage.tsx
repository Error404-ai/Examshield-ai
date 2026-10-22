/**
 * Exam Results Page (admin)
 * Stats and per-student results for one exam.
 * Links onward to the proctoring + analytics page (/admin/exams/:examId/review).
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { PageHeader } from "../../components/common/PageHeader";
import { Reveal } from "../../components/common/Motion";
import { StatStrip } from "../../components/common/Statstrip";
import { timeAgo } from "../../components/common/dashboardKit";
import { ALERT_TYPE_LABEL } from "../../services/integrityService";
import { ExamAlert, proctoringService } from "../../services/proctoringService";
import { formatDateTime, getErrorMessage } from "../../utils";

type ResultsData = Awaited<ReturnType<typeof adminService.getExamResults>>;

const severityColor: Record<string, string> = {
  low: "bg-sky-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

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

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-10 lg:px-12">
      <PageHeader
        className="mb-8"
        eyebrow="Exam results"
        title={data.exam_title}
        subtitle="Student performance and proctoring activity for this exam."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/admin/exams/${examId}/review`)}>
              Proctoring and analytics
            </Button>
            <Button variant="secondary" onClick={() => navigate("/admin/dashboard")}>
              Back to dashboard
            </Button>
          </div>
        }
      />

      <StatStrip
        items={[
          { label: "Attempts", value: data.total_attempts },
          { label: "Passed", value: data.passed },
          { label: "Failed", value: data.failed },
          { label: "Average score", value: `${data.average_score}%` },
        ]}
      />

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <Reveal>
          <section aria-labelledby="attempts-heading">
            <div className="mb-4 flex items-end justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 id="attempts-heading" className="font-display text-xl font-semibold text-gray-900">
                  Student attempts
                </h2>
                <p className="mt-1 text-sm text-gray-600">Select an attempt to review answers and exam activity.</p>
              </div>
              <span className="text-sm tabular-nums text-gray-500">{data.results.length} total</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Result</th>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                      <th className="px-4 py-3"><span className="sr-only">Review</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.results.map((result) => (
                      <tr key={result._id} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{result.student_name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{result.student_email}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-700">
                          {result.score}/{result.total_marks} ({result.percentage.toFixed(1)}%)
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={result.passed ? "success" : "error"}>
                            {result.passed ? "Passed" : "Failed"}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-500">
                          {result.submitted_at ? formatDateTime(result.submitted_at) : "-"}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/sessions/${result._id}/review`)}
                            className="text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:underline"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.results.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="font-medium text-gray-900">No submissions yet</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Results and proctoring activity will appear here when students finish this exam.
                  </p>
                </div>
              )}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section aria-labelledby="alerts-heading">
            <div className="mb-4 flex items-end justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 id="alerts-heading" className="font-display text-xl font-semibold text-gray-900">
                  Recent proctoring alerts
                </h2>
                <p className="mt-1 text-sm text-gray-600">Latest events across this exam’s attempts.</p>
              </div>
              {alerts.length > 0 && (
                <span className="text-sm tabular-nums text-gray-500">{alerts.length} latest</span>
              )}
            </div>
            {alertsError ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700">
                {alertsError}
              </p>
            ) : alertsLoading ? (
              <div className="flex justify-center rounded-lg border border-gray-200 bg-white py-8" aria-label="Loading exam alerts">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              </div>
            ) : alerts.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-white px-5 py-6 text-sm text-gray-600">
                No alerts recorded for this exam yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {alerts.map((alert, index) => (
                  <li key={`${alert.session_id}-${alert.timestamp}-${index}`}>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/sessions/${alert.session_id}/review`)}
                      className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50"
                      title={`Review ${alert.student_name}'s attempt`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityColor[alert.severity] ?? "bg-gray-400"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900">
                          {ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type}
                        </span>
                        {alert.description && (
                          <span className="mt-1 block text-sm text-gray-600">{alert.description}</span>
                        )}
                        <span className="mt-1.5 block text-xs text-gray-500">
                          <span className="capitalize">{alert.severity}</span> · {alert.student_name} · {timeAgo(alert.timestamp)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-indigo-700">View attempt</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
      </div>
    </div>
  );
};