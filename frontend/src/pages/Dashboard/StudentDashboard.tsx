/**
 * Student Dashboard Page
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { StudentStats, Exam } from "../../types";
import { ExamCard } from "../../components/exam/ExamCard";
import { UserRole } from "../../types";
import { getErrorMessage } from "../../utils";

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
        const statsData = await studentService.getStats();
        const examsData = await studentService.getAvailableExams();
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
          <p className="text-sm text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back! Check your exam status</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Available Exams</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.available_exams}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Attempted</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.attempted}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Passed</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.passed}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600">Failed</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{stats.failed}</p>
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
        <h2 className="text-xl font-bold text-gray-900 mb-4">Available Exams</h2>
        {exams.length === 0 ? (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No exams available at the moment</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <ExamCard
                key={exam._id}
                exam={exam}
                onStart={() => navigate(`/student/exam/${exam._id}`)}
                onView={() => navigate(`/student/results/${exam._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};