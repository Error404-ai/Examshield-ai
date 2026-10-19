/**
 * Student Dashboard Page
 * Greeting, stat strip, proctoring notice, and a filterable exam list.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { StudentStats, Exam, SessionStatus, UserRole } from "../../types";
import { ExamCard } from "../../components/exam/ExamCard";
import { StatStrip } from "../../components/common/Statstrip";
import { Alert } from "../../components/common/Badge";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../utils";

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
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-gray-900">Welcome back, {firstName}</h1>
      <p className="mt-1 text-gray-500">Here&rsquo;s where your exams stand.</p>

      {stats && (
        <div className="mt-8">
          <StatStrip
            items={[
              { label: "Available", value: stats.available_exams },
              { label: "Attempted", value: stats.attempted },
              { label: "Passed", value: stats.passed },
              { label: "Failed", value: stats.failed },
            ]}
          />
        </div>
      )}

      <p className="mt-8 border-l-2 border-amber-400 pl-4 text-sm leading-relaxed text-gray-700">
        <strong className="font-medium text-gray-900">Exams are proctored.</strong> You&rsquo;ll need to allow your
        camera, stay on the exam tab and in fullscreen, and keep your face in view. Leaving the tab or fullscreen is
        recorded.
      </p>

      {error && (
        <div className="mt-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
        <h2 className="pb-2 font-display text-xl font-semibold text-gray-900">Your exams</h2>
        <div className="flex gap-5" role="tablist" aria-label="Filter exams">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                filter === f.id
                  ? "border-indigo-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-gray-700">
            {exams.length === 0 ? "No exams are available right now." : "No exams match this filter."}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {exams.length === 0 ? "Check back when your instructor publishes one." : "Try another tab."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {visible.map((exam) => (
            <ExamCard
              key={exam._id}
              exam={exam}
              role={UserRole.STUDENT}
              onStart={() => navigate(`/student/exam/${exam._id}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};