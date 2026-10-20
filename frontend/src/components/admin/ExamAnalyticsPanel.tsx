/**
 * ExamAnalyticsPanel
 * Score distribution, pass rate and per-question difficulty for one exam.
 */

import React, { useEffect, useState } from "react";
import { adminService, ExamAnalytics } from "../../services/examService";
import { Alert } from "../common/Badge";
import { getErrorMessage } from "../../utils";

const Stat: React.FC<{ label: string; value: string | number; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="border-gray-200 px-5 py-4 sm:border-l sm:first:border-l-0">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-gray-900">{value}</dd>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
);

const pctBar = (pct: number) => (pct < 40 ? "bg-red-500" : pct < 70 ? "bg-amber-500" : "bg-green-600");

export const ExamAnalyticsPanel: React.FC<{ examId: string }> = ({ examId }) => {
  const [data, setData] = useState<ExamAnalytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminService
      .getExamAnalytics(examId)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert variant="error">{error || "Could not load analytics"}</Alert>;
  }

  if (data.attempts === 0) {
    return (
      <div className="border-y border-gray-200 px-6 py-12 text-center text-gray-600">
        Analytics will appear once students have submitted this exam.
      </div>
    );
  }

  const maxCount = Math.max(...data.distribution.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-8">
      {/* Summary */}
      <dl className="grid grid-cols-2 gap-y-4 border-y border-gray-300 sm:grid-cols-4 sm:gap-y-0">
        <Stat label="Submissions" value={data.attempts} />
        <Stat
          label="Pass rate"
          value={`${data.pass_rate}%`}
          hint={`${data.passed} passed · ${data.failed} failed`}
        />
        <Stat
          label="Average score"
          value={`${data.average_score}%`}
          hint={`Range ${data.lowest}% – ${data.highest}%`}
        />
        <Stat
          label="Avg. time taken"
          value={`${data.average_minutes} min`}
          hint={`${data.flagged_sessions} session${data.flagged_sessions === 1 ? "" : "s"} with high/critical alerts`}
        />
      </dl>

      {/* Distribution */}
      <section className="border-t border-gray-300 pt-6">
        <h3 className="mb-4 font-display text-lg font-semibold text-gray-900">Score distribution</h3>
        <div className="flex h-44 items-end gap-2">
          {data.distribution.map((b) => (
            <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs tabular-nums text-gray-500">{b.count > 0 ? b.count : ""}</span>
              <div
                className="w-full rounded-t bg-indigo-600"
                style={{
                  height: `${(b.count / maxCount) * 100}%`,
                  minHeight: b.count > 0 ? 4 : 2,
                  opacity: b.count > 0 ? 1 : 0.15,
                }}
              />
              <span className="text-[10px] text-gray-500">{b.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-gray-500">Score (%)</p>
      </section>

      {/* Questions */}
      <section>
        <h3 className="font-display text-lg font-semibold text-gray-900">Question difficulty</h3>
        <p className="mb-4 mt-1 text-sm text-gray-500">
          Share of students who answered correctly. Hardest questions first; very low scores can point
          to an unclear question or a wrong answer key.
        </p>
        <ul className="divide-y divide-gray-200 border-y border-gray-200">
          {data.questions.map((q, i) => (
            <li key={q.question_id} className="px-5 py-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800">
                  <span className="text-gray-400">{i + 1}.</span> {q.question_text}
                </p>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                  {q.correct_pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${pctBar(q.correct_pct)}`}
                  style={{ width: `${Math.max(q.correct_pct, 2)}%` }}
                />
              </div>
              {q.skipped > 0 && <p className="mt-1.5 text-xs text-gray-500">{q.skipped} skipped</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
