/**
 * Exam Review Page (admin)
 * Two tabs: proctoring review of sessions, and exam analytics.
 * Sessions auto-refresh so an exam can be watched live.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  proctoringService,
  SessionSummary,
  SessionAlertsDetail,
  Recommendation,
} from "../../services/proctoringService";
import { ExamAnalyticsPanel } from "../../components/admin/ExamAnalyticsPanel";
import { StatStrip } from "../../components/common/Statstrip";
import { Alert } from "../../components/common/Badge";
import { SessionStatus } from "../../types";
import {
  formatDateTime,
  getAlertSeverityColor,
  getErrorMessage,
  getRecommendationColor,
  getSessionStatusLabel,
} from "../../utils";

const REFRESH_MS = 15000;

const typeLabel: Record<string, string> = {
  tab_switch: "Tab switches",
  fullscreen_exit: "Fullscreen exits",
  face_not_detected: "No face",
  multiple_faces: "Multiple faces",
  looking_away: "Looking away",
  eyes_closed: "Eyes closed",
  camera_blocked: "Camera blocked",
};

const recLabel: Record<Recommendation, string> = {
  approve: "Clear",
  review: "Needs review",
  reject: "High risk",
};

const barColor: Record<Recommendation, string> = {
  approve: "bg-green-600",
  review: "bg-amber-500",
  reject: "bg-red-600",
};

const RiskBadge: React.FC<{ rec: Recommendation }> = ({ rec }) => (
  <span
    className={`inline-block w-fit rounded-md px-2 py-0.5 text-xs font-medium ${getRecommendationColor(rec)}`}
  >
    {recLabel[rec]}
  </span>
);

const RiskBar: React.FC<{ score: number; rec: Recommendation }> = ({ score, rec }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full ${barColor[rec]}`} style={{ width: `${Math.max(score, 3)}%` }} />
    </div>
    <span className="text-xs tabular-nums text-gray-500">{score}</span>
  </div>
);

export const ExamReviewPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"sessions" | "analytics">("sessions");
  const [examTitle, setExamTitle] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionAlertsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const data = await proctoringService.getExamSessions(examId);
      setExamTitle(data.exam_title);
      setSessions(data.sessions);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  // Initial load + live refresh
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Alert timeline of the selected session (refetched when its alert count changes)
  const selectedAlertCount = sessions.find((s) => s.session_id === selectedId)?.total_alerts;
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
  }, [selectedId, selectedAlertCount]);

  const flagged = sessions.filter((s) => s.recommendation !== "approve").length;
  const live = sessions.filter((s) => s.status === SessionStatus.ONGOING).length;
  const scored = sessions.filter((s) => s.percentage !== null);
  const avgPct = scored.length
    ? scored.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / scored.length
    : 0;

  const visible = filter === "flagged" ? sessions.filter((s) => s.recommendation !== "approve") : sessions;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <button
        type="button"
        onClick={() => navigate("/admin/dashboard")}
        className="mb-3 text-sm font-medium text-indigo-700 hover:text-indigo-900"
      >
        ← Back to dashboard
      </button>
      <h1 className="font-display text-3xl font-semibold text-gray-900">{examTitle || "Exam"}</h1>
      <p className="mb-6 mt-1 text-gray-500">Results, AI proctoring review and exam analytics.</p>

      {error && (
        <div className="mb-6">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-gray-200" role="tablist">
        {(
          [
            ["sessions", "Sessions & proctoring"],
            ["analytics", "Analytics"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-indigo-600 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "analytics" && examId && <ExamAnalyticsPanel examId={examId} />}

      {tab === "sessions" && (
        <>
          <StatStrip
            items={[
              { label: "Sessions", value: sessions.length },
              { label: "Flagged for review", value: flagged },
              { label: "Taking exam now", value: live },
              { label: "Average score", value: `${avgPct.toFixed(1)}%` },
            ]}
          />

          {/* Filter */}
          <div className="mb-3 mt-8 flex items-center gap-2">
            {(["all", "flagged"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-indigo-50 text-indigo-800"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {f === "all" ? "All sessions" : "Flagged only"}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">Refreshes every 15 seconds</span>
          </div>

          {/* Table */}
          <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            {visible.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-600">
                {sessions.length === 0 ? "No students have started this exam yet." : "No flagged sessions."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Proctoring risk</th>
                    <th className="px-4 py-3 font-medium">Alerts</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr
                      key={s.session_id}
                      onClick={() => setSelectedId(s.session_id === selectedId ? null : s.session_id)}
                      className={`cursor-pointer border-t border-gray-200 transition-colors hover:bg-gray-50 ${
                        s.session_id === selectedId ? "bg-indigo-50/60" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.student_name}</p>
                        <p className="text-xs text-gray-500">{s.student_email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {getSessionStatusLabel(s.status as SessionStatus)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {s.percentage !== null ? (
                          <>
                            {s.score}/{s.total_marks}{" "}
                            <span className="text-xs text-gray-500">({s.percentage.toFixed(1)}%)</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <RiskBar score={s.suspicion_score} rec={s.recommendation} />
                          <RiskBadge rec={s.recommendation} />
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{s.total_alerts}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {s.submitted_at ? formatDateTime(s.submitted_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail */}
          {selectedId && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              {detailLoading || !detail ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-gray-900">{detail.student_name}</h2>
                      <p className="text-sm text-gray-500">{detail.student_email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RiskBar score={detail.suspicion_score} rec={detail.recommendation} />
                      <RiskBadge rec={detail.recommendation} />
                    </div>
                  </div>

                  {Object.keys(detail.counts).length > 0 && (
                    <div className="mb-5 flex flex-wrap gap-2">
                      {Object.entries(detail.counts).map(([type, n]) => (
                        <span
                          key={type}
                          className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                        >
                          {typeLabel[type] ?? type}: <strong>{n}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Timeline</h3>
                  {detail.alerts.length === 0 ? (
                    <p className="text-sm text-gray-500">No suspicious activity recorded.</p>
                  ) : (
                    <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
                      {detail.alerts.map((a, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${getAlertSeverityColor(
                            a.severity
                          )}`}
                        >
                          <span className="shrink-0 text-xs tabular-nums opacity-70">
                            {new Date(a.timestamp).toLocaleTimeString("en-IN")}
                          </span>
                          <span className="shrink-0 font-medium">{typeLabel[a.alert_type] ?? a.alert_type}</span>
                          <span className="opacity-80">{a.description}</span>
                          <span className="ml-auto text-xs uppercase opacity-70">{a.severity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
