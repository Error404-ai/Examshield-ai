/**
 * Admin Dashboard Page
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { adminService } from "../../services/examService";
import { ExamCard } from "../../components/exam/ExamCard";
import { Button } from "../../components/common/Button";
import { getErrorMessage } from "../../utils";
import { AdminStats, Exam, UserRole } from "../../types";

const statCards: {
  key: keyof AdminStats;
  label: string;
  number: string;
  panel: string;
}[] = [
  { key: "total_exams", label: "Total Exams", number: "text-violet-300", panel: "glass-violet" },
  { key: "published_exams", label: "Published", number: "text-cyan-400", panel: "glass-cyan" },
  { key: "total_students", label: "Total Students", number: "text-emerald-400", panel: "glass-emerald" },
  { key: "total_sessions", label: "Sessions", number: "text-amber-400", panel: "glass-amber" },
];

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, examsData] = await Promise.all([
        adminService.getDashboard(),
        adminService.getExams(),
      ]);
      setStats(statsData);
      setExams(examsData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (examId: string) => {
    const exam = exams.find((e) => e._id === examId);
    if (!window.confirm(`Delete "${exam?.title}"? This cannot be undone.`)) return;
    try {
      await adminService.deleteExam(examId);
      await fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-50">Admin Dashboard</h1>
          <p className="mt-1 text-slate-400">Manage exams and monitor student activity</p>
        </div>
        <Button onClick={() => navigate("/admin/exams/new")}>Create Exam</Button>
      </div>

      {stats && (
        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
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
            </motion.div>
          ))}
        </div>
      )}

      {error && (
        <div className="glass-rose mb-8 rounded-xl p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      <h2 className="mb-4 font-display text-xl font-semibold text-slate-100">All Exams</h2>

      {exams.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="mb-4 text-slate-400">No exams created yet</p>
          <Button onClick={() => navigate("/admin/exams/new")}>Create Your First Exam</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <ExamCard
              key={exam._id}
              exam={exam}
              role={UserRole.ADMIN}
              onEdit={(id) => navigate(`/admin/exams/${id}/edit`)}
              onViewResults={(id) => navigate(`/admin/exams/${id}/review`)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
