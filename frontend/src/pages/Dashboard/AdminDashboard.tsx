/**
 * Admin Dashboard
 * Hero with live integrity snapshot, KPI strip, exam table with per-exam
 * attempts and average score, and a side column explaining how exams are protected.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { proctoringService } from "../../services/proctoringService";
import { AdminStats, BehaviorAlert, Exam } from "../../types";
import { getErrorMessage } from "../../utils";
import {
  CountUp,
  Eyebrow,
  Icon,
  PageLoader,
  Reveal,
  ScoreBar,
  gridBackground,
  timeAgo,
} from "../../components/common/dashboardKit";

// Match these to the routes in App.tsx if yours differ
const INTEGRITY_PATH = "/admin/integrity";
const resultsPath = (examId: string) => `/admin/exams/${examId}/results`;
const editPath = (examId: string) => `/admin/exams/${examId}/edit`;

interface ExamStat {
  attempts: number;
  passed: number;
  avg: number;
}

const SEVERITIES = [
  { key: "critical", label: "Critical", bar: "bg-rose-500", dot: "bg-rose-500" },
  { key: "high", label: "High", bar: "bg-orange-500", dot: "bg-orange-500" },
  { key: "medium", label: "Medium", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "low", label: "Low", bar: "bg-sky-500", dot: "bg-sky-500" },
] as const;

const protections = [
  { icon: "camera", title: "Webcam monitoring", text: "Faces and gaze are checked in the student's browser. No video is uploaded." },
  { icon: "expand", title: "Focus tracking", text: "Tab switches and leaving the exam window are logged with timestamps." },
  { icon: "chart", title: "Risk scoring", text: "Every attempt gets a risk score so you review the right ones first." },
  { icon: "sparkles", title: "AI question drafts", text: "Generate multiple-choice questions from a topic, then edit before publishing." },
] as const;

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [perExam, setPerExam] = useState<Record<string, ExamStat>>({});
  const [alerts, setAlerts] = useState<BehaviorAlert[]>([]);
  const [alertsState, setAlertsState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadExtras = useCallback(async (list: Exam[]) => {
    const published = list.filter((e) => e.is_published).slice(0, 12);
    const settled = await Promise.allSettled(published.map((e) => adminService.getExamResults(e._id)));
    const map: Record<string, ExamStat> = {};
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        map[published[i]._id] = {
          attempts: r.value.total_attempts,
          passed: r.value.passed,
          avg: r.value.average_score,
        };
      }
    });
    setPerExam(map);

    try {
      const sessionResults = await Promise.allSettled(
        published.map((exam) => proctoringService.getExamSessions(exam._id))
      );
      const sessionIds: string[] = [];
      sessionResults.forEach((result) => {
        if (result.status !== "fulfilled") return;
        const response = result.value as unknown;
        const sessions = Array.isArray(response)
          ? response
          : response && typeof response === "object" && "sessions" in response && Array.isArray(response.sessions)
            ? response.sessions
            : [];
        sessions.forEach((value: unknown) => {
          if (!value || typeof value !== "object") return;
          const session = value as Record<string, unknown>;
          const id = session.session_id ?? session._id ?? session.id;
          if (typeof id === "string" && id) sessionIds.push(id);
        });
      });

      const alertResults = await Promise.allSettled(
        sessionIds.map((sessionId) => proctoringService.getSessionAlerts(sessionId))
      );
      const collected: BehaviorAlert[] = [];
      alertResults.forEach((result) => {
        if (result.status !== "fulfilled") return;
        const response = result.value as unknown;
        const items = Array.isArray(response)
          ? response
          : response && typeof response === "object" && "alerts" in response && Array.isArray(response.alerts)
            ? response.alerts
            : [];
        collected.push(...(items as BehaviorAlert[]));
      });
      if (sessionIds.length > 0 && alertResults.every((result) => result.status === "rejected")) {
        setAlertsState("unavailable");
        return;
      }
      const sorted = collected.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setAlerts(sorted);
      setAlertsState("ready");
    } catch {
      setAlertsState("unavailable");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, e] = await Promise.all([adminService.getDashboard(), adminService.getExams()]);
      setStats(s);
      setExams(e);
      void loadExtras(e);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadExtras]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (exam: Exam) => {
    if (!window.confirm(`Delete "${exam.title}"? This cannot be undone.`)) return;
    try {
      await adminService.deleteExam(exam._id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const totals = useMemo(() => {
    let attempts = 0;
    let passed = 0;
    let weighted = 0;
    Object.values(perExam).forEach((s) => {
      attempts += s.attempts;
      passed += s.passed;
      weighted += s.avg * s.attempts;
    });
    return {
      attempts,
      passRate: attempts ? (passed / attempts) * 100 : 0,
      avg: attempts ? weighted / attempts : 0,
    };
  }, [perExam]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((a) => {
      const key = String(a.severity);
      if (key in counts) counts[key] += 1;
    });
    return counts;
  }, [alerts]);
  const maxSeverity = Math.max(1, ...Object.values(severityCounts));

  if (loading) return <PageLoader label="Loading your dashboard..." />;

  const drafts = exams.filter((e) => !e.is_published).length;
  const kpis = [
    { icon: "document", label: "Exams", value: stats?.total_exams ?? 0, note: `${stats?.published_exams ?? 0} published · ${drafts} draft${drafts === 1 ? "" : "s"}` },
    { icon: "users", label: "Students", value: stats?.total_students ?? 0, note: "registered on the platform" },
    { icon: "eye", label: "Proctored attempts", value: stats?.total_sessions ?? 0, note: "sessions started" },
    { icon: "check", label: "Pass rate", value: totals.passRate, suffix: "%", decimals: 0, note: totals.attempts ? `across ${totals.attempts} graded attempts` : "no graded attempts yet" },
    { icon: "chart", label: "Average score", value: totals.avg, suffix: "%", decimals: 0, note: "weighted by attempts" },
  ] as const;

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white" style={gridBackground}>
        <div className="mx-auto grid max-w-[1600px] gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-10 lg:py-16">
          <Reveal className="flex flex-col justify-center">
            <Eyebrow>Admin dashboard</Eyebrow>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              Exams you can trust,
              <br />
              <span className="text-[#0E7490]">proctored by AI.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Build exams with AI-drafted questions, watch integrity signals as students take them, and review every attempt by risk score.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/admin/exams/new")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0E7490] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5f76]"
              >
                Create exam <Icon name="arrow" className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate("/admin/exams/new")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#0E7490] hover:text-[#0E7490]"
              >
                <Icon name="sparkles" className="h-4 w-4" /> Generate with AI
              </button>
            </div>
          </Reveal>

          {/* Integrity snapshot */}
          <Reveal delay={0.1} className="flex items-center">
            <div className="w-full rounded-2xl bg-slate-900 p-7 text-white shadow-xl shadow-slate-900/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-cyan-300">
                    <Icon name="shield" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Integrity snapshot</p>
                    <p className="text-xs text-slate-400">Alerts across your exams</p>
                  </div>
                </div>
                <Link to={INTEGRITY_PATH} className="text-xs font-medium text-cyan-300 hover:text-cyan-200">
                  Open review →
                </Link>
              </div>

              {alertsState === "loading" && <p className="mt-8 text-sm text-slate-400">Loading alerts...</p>}
              {alertsState === "unavailable" && (
                <p className="mt-8 text-sm text-slate-400">Alert data isn't available right now.</p>
              )}
              {alertsState === "ready" && alerts.length === 0 && (
                <div className="mt-8 flex items-center gap-3 text-emerald-300">
                  <Icon name="check" className="h-6 w-6" />
                  <p className="text-sm">All clear. No flagged activity yet.</p>
                </div>
              )}
              {alertsState === "ready" && alerts.length > 0 && (
                <ul className="mt-7 space-y-4">
                  {SEVERITIES.map((s) => (
                    <li key={s.key} className="grid grid-cols-[70px_1fr_32px] items-center gap-3 text-sm">
                      <span className="text-slate-300">{s.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/10">
                        <span
                          className={`block h-full rounded-full ${s.bar}`}
                          style={{ width: `${(severityCounts[s.key] / maxSeverity) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-slate-200">{severityCounts[s.key]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-6 lg:px-10">
        {error && (
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        {/* KPI strip */}
        <Reveal delay={0.15}>
          <div className="grid grid-cols-2 divide-slate-200 border-b border-slate-200 py-8 md:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            {kpis.map((k) => (
              <div key={k.label} className="px-0 py-3 lg:px-8 lg:first:pl-0">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="text-[#0E7490]"><Icon name={k.icon} className="h-4 w-4" /></span>
                  {k.label}
                </div>
                <CountUp
                  value={k.value}
                  decimals={"decimals" in k ? k.decimals : 0}
                  suffix={"suffix" in k ? k.suffix : ""}
                  className="mt-2 block font-display text-4xl font-bold text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">{k.note}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Main grid */}
        <div className="grid gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Exams */}
          <Reveal delay={0.2}>
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Your exams</h2>
                <p className="mt-1 text-sm text-slate-500">Attempts and average score update as students submit.</p>
              </div>
              <Link to="/admin/exams/new" className="text-sm font-semibold text-[#0E7490] hover:underline">
                + New exam
              </Link>
            </div>

            {exams.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-display text-xl font-semibold text-slate-900">No exams yet</p>
                <p className="mt-2 text-slate-500">Create one by hand or let AI draft the questions for you.</p>
                <button
                  onClick={() => navigate("/admin/exams/new")}
                  className="mt-6 rounded-lg bg-[#0E7490] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0b5f76]"
                >
                  Create your first exam
                </button>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1fr)_90px_170px_230px] gap-4 border-b border-slate-100 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 md:grid">
                  <span>Exam</span>
                  <span>Attempts</span>
                  <span>Average score</span>
                  <span className="text-right">Actions</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {exams.map((exam) => {
                    const s = perExam[exam._id];
                    return (
                      <li
                        key={exam._id}
                        className="grid items-center gap-4 py-5 transition-colors hover:bg-slate-50/70 md:grid-cols-[minmax(0,1fr)_90px_170px_230px]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="truncate font-display text-lg font-semibold text-slate-900">{exam.title}</h3>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                exam.is_published
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                              }`}
                            >
                              {exam.is_published ? "Published" : "Draft"}
                            </span>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
                            <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{exam.duration} min</span>
                            <span>{exam.total_marks} marks</span>
                            <span>pass at {exam.passing_marks}</span>
                          </p>
                        </div>

                        <div className="hidden md:block">
                          {s ? (
                            <span className="font-display text-xl font-semibold tabular-nums text-slate-900">{s.attempts}</span>
                          ) : (
                            <span className="text-slate-300">{exam.is_published ? "…" : "–"}</span>
                          )}
                        </div>

                        <div className="hidden md:block">
                          {s && s.attempts > 0 ? (
                            <div>
                              <p className="mb-1.5 text-sm font-medium tabular-nums text-slate-700">{s.avg.toFixed(0)}%</p>
                              <ScoreBar pct={s.avg} />
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">{exam.is_published ? "No attempts yet" : "Not published"}</span>
                          )}
                        </div>

                        <div className="flex justify-start gap-2 md:justify-end">
                          <button
                            onClick={() => navigate(editPath(exam._id))}
                            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => navigate(resultsPath(exam._id))}
                            className="rounded-lg bg-[#0E7490] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#0b5f76]"
                          >
                            Results
                          </button>
                          <button
                            onClick={() => handleDelete(exam)}
                            className="rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Reveal>

          {/* Side column */}
          <Reveal delay={0.25} className="space-y-12">
            <section>
              <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <h2 className="font-display text-xl font-bold text-slate-900">Recent alerts</h2>
                <Link to={INTEGRITY_PATH} className="text-sm font-semibold text-[#0E7490] hover:underline">View all</Link>
              </div>
              {alertsState === "ready" && alerts.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {alerts.slice(0, 6).map((a, i) => {
                    const sev = SEVERITIES.find((s) => s.key === String(a.severity));
                    return (
                      <li key={`${a.session_id}-${a.timestamp}-${i}`} className="flex gap-3 py-3.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev?.dot ?? "bg-slate-400"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{a.description || a.alert_type}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {sev?.label ?? a.severity} · {timeAgo(a.timestamp)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-6 text-sm text-slate-500">
                  {alertsState === "loading" ? "Loading alerts..." : "No alerts to show. Flagged activity from live exams will appear here."}
                </p>
              )}
            </section>

            <section>
              <h2 className="border-b border-slate-200 pb-4 font-display text-xl font-bold text-slate-900">
                How every exam is protected
              </h2>
              <ul className="divide-y divide-slate-100">
                {protections.map((p) => (
                  <li key={p.title} className="flex gap-4 py-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0E7490]/10 text-[#0E7490]">
                      <Icon name={p.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{p.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
};