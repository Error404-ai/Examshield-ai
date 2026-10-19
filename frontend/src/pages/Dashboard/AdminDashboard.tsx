/**
 * Admin Dashboard Page
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { ExamCard } from "../../components/exam/ExamCard";
import { StatStrip } from "../../components/common/Statstrip";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Badge";
import { getErrorMessage } from "../../utils";
import { AdminStats, Exam, UserRole } from "../../types";

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
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-gray-900">Admin dashboard</h1>
          <p className="mt-1 text-gray-500">Manage exams and review student activity.</p>
        </div>
        <Button onClick={() => navigate("/admin/exams/new")}>Create exam</Button>
      </div>

      {stats && (
        <div className="mt-8">
          <StatStrip
            items={[
              { label: "Total exams", value: stats.total_exams },
              { label: "Published", value: stats.published_exams },
              { label: "Students", value: stats.total_students },
              { label: "Sessions", value: stats.total_sessions },
            ]}
          />
        </div>
      )}

      {error && (
        <div className="mt-6">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      <h2 className="mb-4 mt-10 border-b border-gray-200 pb-2 font-display text-xl font-semibold text-gray-900">
        All exams
      </h2>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="mb-4 text-gray-700">No exams created yet.</p>
          <Button onClick={() => navigate("/admin/exams/new")}>Create your first exam</Button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
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
        </ul>
      )}
    </div>
  );
};