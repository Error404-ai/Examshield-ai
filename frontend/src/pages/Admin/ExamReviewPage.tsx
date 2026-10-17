/**
 * Exam Review Page (admin)
 * Results + AI proctoring review for one exam.
 * Auto-refreshes so an exam can be watched live.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  proctoringService,
  SessionSummary,
  SessionAlertsDetail,
  Recommendation,
} from "../../services/proctoringService";
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
  approve: "bg-green-500",
  review: "bg-yellow-500",
  reject: "bg-red-500",
};

const RiskBadge: React.FC<{ rec: Recommendation }> = ({ rec }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getRecommendationColor(rec)}`}>
    {recLabel[rec]}
  </span>
);

const RiskBar: React.FC<{ score: number; rec: Recommendation }> = ({ score, rec }) => (
  <div className="flex items-center gap-2">
    <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
      <div className={`h-full ${barColor[rec]}`} style={{ width: `${Math.max(score, 3)}%` }} />
    </div>
    <span className="text-xs tabular-nums text-gray-600">{score}</span>
  </div>
);

export const ExamReviewPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

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
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <button
        onClick={() => navigate("/admin/dashboard")}
        className="text-sm text-indigo-600 hover:underline mb-3"
      >
        ← Back to dashboard
      </button>
      <h1 className="text-3xl font-bold text-gray-900">{examTitle || "Exam"}</h1>
      <p className="text-gray-500 mt-1 mb-6">Results and AI proctoring review (refreshes every 15 seconds)</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-600">Sessions</p>
          <p className="text-3xl font-bold text-indigo-600 mt-1">{sessions.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-600">Flagged for review</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{flagged}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-600">Taking exam now</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{live}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-600">Average score</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{avgPct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-3">
        {(["all", "flagged"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filter === f ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? "All sessions" : "Flagged only"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-6">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-gray-500 text-sm">
            {sessions.length === 0 ? "No students have started this exam yet." : "No flagged sessions."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Proctoring risk</th>
                <th className="px-4 py-3">Alerts</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr
                  key={s.session_id}
                  onClick={() => setSelectedId(s.session_id === selectedId ? null : s.session_id)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${
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
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{s.total_alerts}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {detailLoading || !detail ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{detail.student_name}</h2>
                  <p className="text-sm text-gray-500">{detail.student_email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <RiskBar score={detail.suspicion_score} rec={detail.recommendation} />
                  <RiskBadge rec={detail.recommendation} />
                </div>
              </div>

              {Object.keys(detail.counts).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {Object.entries(detail.counts).map(([type, n]) => (
                    <span key={type} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                      {typeLabel[type] ?? type}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>
              )}

              <h3 className="text-sm font-semibold text-gray-700 mb-2">Timeline</h3>
              {detail.alerts.length === 0 ? (
                <p className="text-sm text-gray-500">No suspicious activity recorded.</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
                  {detail.alerts.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${getAlertSeverityColor(
                        a.severity
                      )}`}
                    >
                      <span className="text-xs tabular-nums opacity-70 shrink-0">
                        {new Date(a.timestamp).toLocaleTimeString("en-IN")}
                      </span>
                      <span className="font-medium shrink-0">{typeLabel[a.alert_type] ?? a.alert_type}</span>
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
    </div>
  );
};