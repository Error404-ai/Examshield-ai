/**
 * Integrity Page (admin)
 * One queue of flagged sessions across all of the admin's exams. Pick a row to
 * read its timeline and decide. Open appeals sort to the top.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../../components/common/PageHeader";
import { Reveal } from "../../components/common/Motion";
import { StatStrip } from "../../components/common/Statstrip";
import { Alert, Badge } from "../../components/common/Badge";
import { IntegrityDecisionPanel } from "../../components/admin/IntegrityDecisionPanel";
import { adminService } from "../../services/examService";
import { proctoringService, SessionAlertsDetail, Recommendation } from "../../services/proctoringService";
import {
  ALERT_TYPE_LABEL,
  integrityService,
  QueueFilter,
  QueueResponse,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "../../services/integrityService";
import { Exam } from "../../types";
import { formatDateTime, getAlertSeverityColor, getErrorMessage } from "../../utils";

const TABS: { id: QueueFilter; label: string }[] = [
  { id: "pending", label: "Needs decision" },
  { id: "appealed", label: "Appeals" },
  { id: "resolved", label: "Decided" },
  { id: "all", label: "All flagged" },
];

const EMPTY: Record<QueueFilter, string> = {
  pending: "Nothing is waiting for a decision.",
  appealed: "No open appeals.",
  resolved: "No decisions yet.",
  all: "No sessions have been flagged. Flags appear here after a student submits an exam with a risk score of 20 or more.",
};

const barColor: Record<Recommendation, string> = {
  approve: "bg-green-600",
  review: "bg-amber-500",
  reject: "bg-red-600",
};

export const IntegrityPage: React.FC = () => {
  const [tab, setTab] = useState<QueueFilter>("pending");
  const [examId, setExamId] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionAlertsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const detailIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await integrityService.getQueue(tab, examId || undefined));
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [tab, examId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adminService
      .getExams()
      .then(setExams)
      .catch(() => setExams([]));
  }, []);

  // Timeline of the selected session; refetched after every decision (tick)
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      detailIdRef.current = null;
      return;
    }
    let cancelled = false;
    if (detailIdRef.current !== selectedId) setDetailLoading(true);

    proctoringService
      .getSessionAlerts(selectedId)
      .then((d) => {
        if (cancelled) return;
        detailIdRef.current = selectedId;
        setDetail(d);
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err)))
      .finally(() => !cancelled && setDetailLoading(false));

    return () => {
      cancelled = true;
    };
  }, [selectedId, tick]);

  const onChanged = () => {
    setTick((t) => t + 1);
    load();
  };

  const counts = queue?.counts;
  const rows = queue?.rows ?? [];

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-10 lg:px-12">
      <PageHeader
        className="mb-8"
        eyebrow="Integrity"
        title="Review flagged sessions"
        subtitle="The AI raises flags. You decide what stands, and students can appeal what you confirm."
      />

      {error && (
        <div className="mb-6">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      <StatStrip
        items={[
          { label: "Need a decision", value: counts?.pending ?? 0 },
          { label: "Open appeals", value: counts?.appealed ?? 0 },
          { label: "Decided", value: counts?.resolved ?? 0 },
          { label: "All flagged", value: counts?.all ?? 0 },
        ]}
      />

      <Reveal delay={0.15} className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* Queue */}
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
            <div className="flex flex-wrap gap-5" role="tablist" aria-label="Queue filter">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setSelectedId(null);
                  }}
                  className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "border-indigo-600 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {t.label}
                  {counts && <span className="ml-1.5 tabular-nums text-gray-400">{counts[t.id]}</span>}
                </button>
              ))}
            </div>
            <label className="pb-2 text-sm text-gray-500">
              <span className="sr-only">Filter by exam</span>
              <select
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  setSelectedId(null);
                }}
                className="border-0 border-b border-gray-300 bg-transparent py-1 pl-0 pr-6 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-0"
              >
                <option value="">All exams</option>
                {exams.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!queue ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <p className="max-w-md border-y border-gray-200 px-2 py-14 text-sm text-gray-600">{EMPTY[tab]}</p>
          ) : (
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {rows.map((r) => {
                const active = r.session_id === selectedId;
                return (
                  <li key={r.session_id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(active ? null : r.session_id)}
                      className={`flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-4 text-left transition-colors hover:bg-gray-50 ${
                        active ? "bg-indigo-50/60" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{r.student_name}</p>
                        <p className="truncate text-sm text-gray-500">
                          {r.exam_title}
                          {r.submitted_at ? `, submitted ${formatDateTime(r.submitted_at)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="flex items-center gap-2" title={`Risk score ${r.suspicion_score} of 100`}>
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full ${barColor[r.recommendation]}`}
                              style={{ width: `${Math.max(r.suspicion_score, 3)}%` }}
                            />
                          </div>
                          <span className="w-7 text-xs tabular-nums text-gray-500">{r.suspicion_score}</span>
                        </div>
                        <Badge variant={STATUS_VARIANT[r.status]} dot>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Detail */}
        <section className="lg:sticky lg:top-20 lg:border-l lg:border-gray-200 lg:pl-8">
          {!selectedId ? (
            <p className="py-10 text-sm text-gray-500">Select a session to read its timeline and decide.</p>
          ) : detailLoading || !detail ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-gray-900">{detail.student_name}</h2>
                <p className="text-sm text-gray-500">
                  {detail.student_email} · {detail.exam_title}
                </p>
              </div>

              {Object.keys(detail.counts).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(detail.counts).map(([type, n]) => (
                    <span
                      key={type}
                      className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {ALERT_TYPE_LABEL[type] ?? type}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Timeline</h3>
                {detail.alerts.length === 0 ? (
                  <p className="text-sm text-gray-500">No suspicious activity recorded.</p>
                ) : (
                  <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                    {detail.alerts.map((a, i) => (
                      <div
                        key={i}
                        className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-3 py-2 text-sm ${getAlertSeverityColor(
                          a.severity
                        )}`}
                      >
                        <span className="shrink-0 text-xs tabular-nums opacity-70">
                          {new Date(a.timestamp).toLocaleTimeString("en-IN")}
                        </span>
                        <span className="font-medium">{ALERT_TYPE_LABEL[a.alert_type] ?? a.alert_type}</span>
                        <span className="ml-auto text-xs opacity-70">{a.severity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <IntegrityDecisionPanel key={detail.session_id} detail={detail} onChanged={onChanged} />
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
};
