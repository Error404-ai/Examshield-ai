/**
 * ExamAnalyticsPanel
 * Score distribution, pass rate and per-question difficulty for one exam.
 */

import React, { useEffect, useState } from "react";
import { adminService, ExamAnalytics } from "../../services/examService";
import { getErrorMessage } from "../../utils";

const Card: React.FC<{ label: string; value: string | number; color: string; hint?: string }> = ({
  label,
  value,
  color,
  hint,
}) => (
  <div className="glass rounded-2xl p-5">
    <p className="text-sm text-slate-400">{label}</p>
    <p className={`mt-1 font-display text-3xl font-bold ${color}`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

const pctColor = (pct: number) =>
  pct < 40 ? "bg-rose" : pct < 70 ? "bg-amber" : "bg-emerald";

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-rose rounded-xl p-4">
        <p className="text-sm text-rose-300">{error || "Could not load analytics"}</p>
      </div>
    );
  }

  if (data.attempts === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-slate-400">Analytics will appear once students have submitted this exam.</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.distribution.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Submissions" value={data.attempts} color="text-violet-300" />
        <Card
          label="Pass rate"
          value={`${data.pass_rate}%`}
          color="text-emerald-400"
          hint={`${data.passed} passed · ${data.failed} failed`}
        />
        <Card
          label="Average score"
          value={`${data.average_score}%`}
          color="text-cyan-400"
          hint={`Range ${data.lowest}% – ${data.highest}%`}
        />
        <Card
          label="Avg. time taken"
          value={`${data.average_minutes} min`}
          color="text-amber-400"
          hint={`${data.flagged_sessions} session${data.flagged_sessions === 1 ? "" : "s"} with high/critical alerts`}
        />
      </div>

      {/* Distribution */}
      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-bold text-slate-100">Score distribution</h3>
        <div className="flex h-44 items-end gap-2">
          {data.distribution.map((b) => (
            <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs tabular-nums text-slate-400">{b.count > 0 ? b.count : ""}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-violet to-cyan"
                style={{ height: `${(b.count / maxCount) * 100}%`, minHeight: b.count > 0 ? 4 : 2, opacity: b.count > 0 ? 1 : 0.2 }}
              />
              <span className="text-[10px] text-slate-500">{b.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">Score (%)</p>
      </div>

      {/* Questions */}
      <div className="glass rounded-2xl p-6">
        <h3 className="mb-1 font-display text-lg font-bold text-slate-100">Question difficulty</h3>
        <p className="mb-4 text-sm text-slate-500">
          Share of students who answered correctly. Hardest questions first; very low scores can
          point to an unclear question or a wrong answer key.
        </p>
        <div className="flex flex-col gap-3">
          {data.questions.map((q, i) => (
            <div key={q.question_id} className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm text-slate-200">
                  <span className="text-slate-500">{i + 1}.</span> {q.question_text}
                </p>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">
                  {q.correct_pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full ${pctColor(q.correct_pct)}`}
                  style={{ width: `${Math.max(q.correct_pct, 2)}%` }}
                />
              </div>
              {q.skipped > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">{q.skipped} skipped</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};