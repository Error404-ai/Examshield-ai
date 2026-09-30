/**
 * Admin Dashboard Page
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { ExamCard } from "../../components/exam/ExamCard";
import { Button } from "../../components/common/Button";
import { getErrorMessage } from "../../utils";
import { AdminStats, Exam } from "../../types";

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const statsData = await adminService.getDashboard();
        const examsData = await adminService.getExams();
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage exams and monitor student activity</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Total Exams</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.total_exams}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Published</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.published_exams}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Total Students</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.total_students}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Sessions</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">{stats.total_sessions}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Exams Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">All Exams</h2>
          <Button onClick={() => navigate("/admin/exams/new")} size="sm">
            Create Exam
          </Button>
        </div>

        {exams.length === 0 ? (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No exams created yet</p>
            <Button onClick={() => navigate("/admin/exams/new")}>Create Your First Exam</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <ExamCard
                key={exam._id}
                exam={exam}
                role={"admin" as any}
                onStart={() => navigate(`/admin/exams/${exam._id}/edit`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};