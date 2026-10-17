/**
 * Student Dashboard Page
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { studentService } from "../../services/examService";
import { StudentStats, Exam, UserRole } from "../../types";
import { ExamCard } from "../../components/exam/ExamCard";
import { getErrorMessage } from "../../utils";

const statCards: {
  key: keyof StudentStats;
  label: string;
  number: string;
  panel: string;
}[] = [
  { key: "available_exams", label: "Available Exams", number: "text-violet-300", panel: "glass-violet" },
  { key: "attempted", label: "Attempted", number: "text-cyan-400", panel: "glass-cyan" },
  { key: "passed", label: "Passed", number: "text-emerald-400", panel: "glass-emerald" },
  { key: "failed", label: "Failed", number: "text-rose-400", panel: "glass-rose" },
];

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-100">Student Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome back! Check your exam status.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {statCards.map((c, i) => (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`${c.panel} rounded-2xl p-5`}
            >
              <p className="text-sm text-slate-400">{c.label}</p>
              <p className={`text-4xl font-bold mt-2 ${c.number}`}>{stats[c.key]}</p>
            </motion.div>
          ))}
        </div>
      )}

      {error && (
        <div className="glass-rose rounded-xl p-4 mb-8">
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      <h2 className="text-xl font-semibold text-slate-100 mb-4">Available Exams</h2>
      {exams.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-slate-400">No exams available at the moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => (
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