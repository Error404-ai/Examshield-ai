/**
 * Student Dashboard Page
 * Greeting, stat cards, proctoring notice, and a filterable exam list.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { studentService } from "../../services/examService";
import { StudentStats, Exam, SessionStatus, UserRole } from "../../types";
import { ExamCard } from "../../components/exam/ExamCard";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../utils";

const statCards: {
  key: keyof StudentStats;
  label: string;
  hint: string;
  number: string;
  panel: string;
}[] = [
  { key: "available_exams", label: "Available", hint: "Published exams", number: "text-violet-300", panel: "glass-violet" },
  { key: "attempted", label: "Attempted", hint: "Exams you've taken", number: "text-cyan-400", panel: "glass-cyan" },
  { key: "passed", label: "Passed", hint: "Met the pass mark", number: "text-emerald-400", panel: "glass-emerald" },
  { key: "failed", label: "Failed", hint: "Below the pass mark", number: "text-rose-400", panel: "glass-rose" },
];

type Filter = "all" | "todo" | "progress" | "done";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "Not started" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Completed" },
];

const matches = (exam: Exam, f: Filter): boolean => {
  const done =
    exam.attempted &&
    (exam.session_status === SessionStatus.SUBMITTED ||
      exam.session_status === SessionStatus.EXPIRED);
  const inProgress = exam.attempted && exam.session_status === SessionStatus.ONGOING;
  if (f === "todo") return !exam.attempted;
  if (f === "progress") return !!inProgress;
  if (f === "done") return !!done;
  return true;
};

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsData, examsData] = await Promise.all([
          studentService.getDashboard(),
          studentService.getAvailableExams(),
        ]);
        setStats(statsData);
        setExams(examsData);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const visible = useMemo(() => exams.filter((e) => matches(e, filter)), [exams, filter]);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-7xl px-6 py-10">
      <div className="pointer-events-none absolute -top-10 left-0 h-64 w-64 rounded-full bg-violet/15 blur-3xl" />

      {/* Header */}
      <div className="relative mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-50">
          Welcome back, <span className="text-gradient-violet">{firstName}</span>
        </h1>
        <p className="mt-1 text-slate-400">Here's where your exams stand.</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="relative mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((c, i) => (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`${c.panel} rounded-2xl p-5`}
            >
              <p className="text-sm font-medium text-slate-300">{c.label}</p>
              <p className={`mt-2 font-display text-4xl font-bold ${c.number}`}>{stats[c.key]}</p>
              <p className="mt-1 text-xs text-slate-500">{c.hint}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Proctoring notice */}
      <div className="glass-amber relative mb-10 rounded-2xl p-4">
        <p className="text-sm text-amber-300">
          <span className="font-semibold">Proctored exams.</span> You'll need to allow your camera,
          stay on the exam tab, and keep your face in view. Leaving the tab or going fullscreen-off is
          recorded.
        </p>
      </div>

      {error && (
        <div className="glass-rose mb-8 rounded-xl p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {/* Exams */}
      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-slate-100">Your exams</h2>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.id
                  ? "bg-violet/20 text-violet-300"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-slate-300">
            {exams.length === 0 ? "No exams are available right now." : "No exams match this filter."}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {exams.length === 0 ? "Check back when your instructor publishes one." : "Try another tab."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((exam) => (
            <ExamCard
              key={exam._id}
              exam={exam}
              role={UserRole.STUDENT}
              onStart={() => navigate(`/student/exam/${exam._id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
