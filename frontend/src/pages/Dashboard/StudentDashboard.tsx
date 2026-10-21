/**
 * Student Dashboard
 * Hero with the next exam and a live readiness check, stats strip,
 * filterable exam list, recent results and a plain explanation of proctoring.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { useAuth } from "../../context/AuthContext";
import { Exam, ExamResult, SessionStatus, StudentStats } from "../../types";
import { formatDate, getErrorMessage } from "../../utils";
import {
  CountUp,
  Eyebrow,
  Icon,
  PageLoader,
  Reveal,
  ScoreBar,
  gridBackground,
} from "../../components/common/dashboardKit";

type Filter = "all" | "not_started" | "in_progress" | "completed";
type CamState = "idle" | "checking" | "ok" | "blocked" | "unsupported";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

const rules = [
  { icon: "camera", title: "Keep your face in frame", text: "Your webcam is analysed in your browser. No video is uploaded." },
  { icon: "expand", title: "Stay on the exam tab", text: "Switching tabs or windows is logged and shown to your examiner." },
  { icon: "eye", title: "Look at the screen", text: "Looking away for long stretches can raise a flag for review." },
  { icon: "shield", title: "A person makes the call", text: "Flags only help your examiner review. They aren't a verdict." },
] as const;

const stateOf = (e: Exam): Filter => {
  if (!e.attempted) return "not_started";
  return e.session_status === SessionStatus.ONGOING ? "in_progress" : "completed";
};

const statusPill = (e: Exam): { label: string; cls: string } => {
  const s = stateOf(e);
  if (s === "not_started") return { label: "Available", cls: "bg-sky-50 text-sky-700 ring-sky-200" };
  if (s === "in_progress") return { label: "In progress", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
  if (e.session_status === SessionStatus.PROCTORING_FAILED)
    return { label: "Proctoring failed", cls: "bg-rose-50 text-rose-700 ring-rose-200" };
  return { label: "Submitted", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
};

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stats, setStats] = useState<StudentStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cam, setCam] = useState<CamState>("idle");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const fullscreenOk = typeof document !== "undefined" && !!document.fullscreenEnabled;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, e, r] = await Promise.all([
        studentService.getDashboard(),
        studentService.getAvailableExams(),
        studentService.getMyResults(),
      ]);
      setStats(s);
      setExams(e);
      setResults(r);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const runCameraCheck = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCam("ok");
    } catch {
      setCam("blocked");
    }
  };

  const resultByExam = useMemo(() => {
    const map: Record<string, ExamResult> = {};
    results.forEach((r) => {
      if (!map[r.exam_id]) map[r.exam_id] = r; // newest first from the API
    });
    return map;
  }, [results]);

  const nextExam = useMemo(
    () => exams.find((e) => stateOf(e) === "in_progress") ?? exams.find((e) => stateOf(e) === "not_started"),
    [exams]
  );

  const visible = exams.filter((e) => filter === "all" || stateOf(e) === filter);
  const average = results.length
    ? results.reduce((sum, r) => sum + r.percentage, 0) / results.length
    : 0;

  if (loading) return <PageLoader label="Loading your dashboard..." />;

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const kpis = [
    { label: "Available", value: stats?.available_exams ?? 0, note: "exams open to you" },
    { label: "Attempted", value: stats?.attempted ?? 0, note: "exams taken so far" },
    { label: "Passed", value: stats?.passed ?? 0, note: "above the pass mark" },
    { label: "Failed", value: stats?.failed ?? 0, note: "below the pass mark" },
    { label: "Average score", value: average, suffix: "%", note: results.length ? `over ${results.length} result${results.length === 1 ? "" : "s"}` : "no results yet" },
  ] as const;

  const checks: { icon: "camera" | "wifi" | "expand"; label: string; state: "ok" | "bad" | "idle" | "busy"; text: string }[] = [
    {
      icon: "camera",
      label: "Camera",
      state: cam === "ok" ? "ok" : cam === "blocked" || cam === "unsupported" ? "bad" : cam === "checking" ? "busy" : "idle",
      text:
        cam === "ok" ? "Working" :
        cam === "blocked" ? "Blocked. Allow camera access in your browser" :
        cam === "unsupported" ? "Not supported in this browser" :
        cam === "checking" ? "Checking..." : "Not checked yet",
    },
    { icon: "wifi", label: "Connection", state: online ? "ok" : "bad", text: online ? "Online" : "You're offline" },
    { icon: "expand", label: "Fullscreen", state: fullscreenOk ? "ok" : "bad", text: fullscreenOk ? "Supported" : "Not supported in this browser" },
  ];
  const tone = { ok: "text-emerald-600", bad: "text-rose-600", idle: "text-slate-400", busy: "text-amber-600" } as const;

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white" style={gridBackground}>
        <div className="mx-auto grid max-w-[1600px] gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-10 lg:py-16">
          <Reveal className="flex flex-col justify-center">
            <Eyebrow>Student dashboard</Eyebrow>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              Welcome back, {firstName}.
              <br />
              <span className="text-[#0E7490]">Ready when you are.</span>
            </h1>

            {nextExam ? (
              <div className="mt-8 max-w-xl border-l-4 border-[#0E7490] pl-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {stateOf(nextExam) === "in_progress" ? "Resume your exam" : "Up next"}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{nextExam.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-4 w-4" />{nextExam.duration} min</span>
                  <span>{nextExam.total_marks} marks</span>
                  <span className="inline-flex items-center gap-1 text-[#0E7490]"><Icon name="camera" className="h-4 w-4" />Camera proctored</span>
                </p>
                <button
                  onClick={() => navigate(`/student/exam/${nextExam._id}`)}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0E7490] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5f76]"
                >
                  {stateOf(nextExam) === "in_progress" ? "Resume exam" : "Start exam"} <Icon name="arrow" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-6 max-w-xl text-lg text-slate-600">
                You're all caught up. New exams from your examiner will show up here.
              </p>
            )}
          </Reveal>

          {/* Readiness check */}
          <Reveal delay={0.1} className="flex items-center">
            <div className="w-full rounded-2xl bg-slate-900 p-7 text-white shadow-xl shadow-slate-900/10">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-cyan-300">
                  <Icon name="shield" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Before you start</p>
                  <p className="text-xs text-slate-400">Your exam is AI-proctored. Check your setup.</p>
                </div>
              </div>
              <ul className="mt-6 divide-y divide-white/10">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center justify-between py-3.5">
                    <span className="flex items-center gap-3 text-sm text-slate-200">
                      <Icon name={c.icon} className="h-5 w-5 text-slate-400" />
                      {c.label}
                    </span>
                    <span className={`flex items-center gap-1.5 text-sm ${tone[c.state]}`}>
                      {c.state === "ok" && <Icon name="check" className="h-4 w-4" />}
                      {c.state === "bad" && <Icon name="warning" className="h-4 w-4" />}
                      {c.text}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={runCameraCheck}
                disabled={cam === "checking"}
                className="mt-5 w-full rounded-lg bg-white/10 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
              >
                {cam === "ok" ? "Check camera again" : "Run camera check"}
              </button>
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
                <p className="text-sm text-slate-500">{k.label}</p>
                <CountUp
                  value={k.value}
                  decimals={0}
                  suffix={"suffix" in k ? k.suffix : ""}
                  className="mt-2 block font-display text-4xl font-bold text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">{k.note}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Exams */}
          <Reveal delay={0.2}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
              <h2 className="font-display text-2xl font-bold text-slate-900">Your exams</h2>
              <div className="flex gap-1 text-sm">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${
                      filter === f.key ? "bg-[#0E7490] text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="py-14 text-center text-slate-500">
                {exams.length === 0 ? "No exams are available yet." : "Nothing in this view."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visible.map((exam) => {
                  const pill = statusPill(exam);
                  const s = stateOf(exam);
                  const result = resultByExam[exam._id];
                  return (
                    <li key={exam._id} className="flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-slate-50/70">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="font-display text-lg font-semibold text-slate-900">{exam.title}</h3>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${pill.cls}`}>{pill.label}</span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{exam.duration} min</span>
                          <span>{exam.total_marks} marks</span>
                          <span>pass at {exam.passing_marks}</span>
                          <span className="inline-flex items-center gap-1 text-[#0E7490]"><Icon name="camera" className="h-3.5 w-3.5" />Proctored</span>
                        </p>
                      </div>

                      {s === "completed" ? (
                        <div className="flex items-center gap-4">
                          {result && (
                            <span className="text-sm tabular-nums text-slate-600">
                              {result.score}/{result.total_marks} · {result.percentage.toFixed(0)}%
                            </span>
                          )}
                          <button
                            disabled={!result}
                            onClick={() => result && navigate(`/student/results/${result._id}`)}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-[#0E7490] hover:text-[#0E7490] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View result
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => navigate(`/student/exam/${exam._id}`)}
                          className="rounded-lg bg-[#0E7490] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0b5f76]"
                        >
                          {s === "in_progress" ? "Resume exam" : "Start exam"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>

          {/* Side column */}
          <Reveal delay={0.25} className="space-y-12">
            <section>
              <h2 className="border-b border-slate-200 pb-4 font-display text-xl font-bold text-slate-900">Recent results</h2>
              {results.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">Your results will appear here after your first exam.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.slice(0, 5).map((r) => (
                    <li key={r._id}>
                      <button onClick={() => navigate(`/student/results/${r._id}`)} className="block w-full py-4 text-left transition hover:bg-slate-50/70">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{r.exam_title ?? "Exam"}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{formatDate(r.submitted_at ?? r.started_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-lg font-semibold tabular-nums text-slate-900">{r.percentage.toFixed(0)}%</p>
                            <p className={`text-xs font-medium ${r.passed ? "text-emerald-600" : "text-rose-600"}`}>
                              {r.passed ? "Passed" : "Failed"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3"><ScoreBar pct={r.percentage} /></div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="border-b border-slate-200 pb-4 font-display text-xl font-bold text-slate-900">How proctoring works</h2>
              <ul className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <li key={r.title} className="flex gap-4 py-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0E7490]/10 text-[#0E7490]">
                      <Icon name={r.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{r.text}</p>
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