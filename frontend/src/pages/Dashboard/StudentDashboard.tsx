/**
 * Student Dashboard Page
 * Wide two-column layout: filterable exam list on the left, recent results
 * and the proctoring notice on the right.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { StudentStats, Exam, ExamResult, SessionStatus, UserRole } from "../../types";
import { ExamCard } from "../../components/exam/ExamCard";
import { PageHeader } from "../../components/common/PageHeader";
import { Reveal } from "../../components/common/Motion";
import { StatStrip } from "../../components/common/Statstrip";
import { Alert, Badge } from "../../components/common/Badge";
import { useAuth } from "../../context/AuthContext";
import { formatDateTime, getErrorMessage } from "../../utils";

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
  const [results, setResults] = useState<ExamResult[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsData, examsData, resultsData] = await Promise.all([
          studentService.getDashboard(),
          studentService.getAvailableExams(),
          studentService.getMyResults().catch(() => [] as ExamResult[]),
        ]);
        setStats(statsData);
        setExams(examsData);
        setResults(resultsData);
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
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-6 py-10">
      <PageHeader
        eyebrow="Student dashboard"
        title={`Welcome back, ${firstName}`}
        subtitle="Here’s where your exams stand."
      />

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

      {error && (
        <div className="mt-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <Reveal delay={0.2} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Exams */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
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
            <div className="flex min-h-[260px] flex-col items-center justify-center border-y border-gray-200 px-6 text-center">
              <p className="text-gray-700">
                {exams.length === 0 ? "No exams are available right now." : "No exams match this filter."}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {exams.length === 0 ? "Check back when your instructor publishes one." : "Try another tab."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {visible.map((exam, i) => (
                <ExamCard
                  key={exam._id}
                  index={i}
                  exam={exam}
                  role={UserRole.STUDENT}
                  onStart={() => navigate(`/student/exam/${exam._id}`)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Side column */}
        <aside className="flex flex-col gap-8">
          <section>
            <div className="mb-3 flex items-baseline justify-between border-b border-gray-200 pb-2">
              <h2 className="font-display text-xl font-semibold text-gray-900">Recent results</h2>
              {results.length > 0 && (
                <Link to="/student/results" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">
                  View all
                </Link>
              )}
            </div>
            {results.length === 0 ? (
              <p className="border-y border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                Your results will show up here after your first exam.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200 border-y border-gray-200">
                {results.slice(0, 5).map((r) => (
                  <li key={r._id}>
                    <Link
                      to={`/student/results/${r._id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{r.exam_title}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(r.submitted_at || r.started_at)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm tabular-nums text-gray-700">{r.percentage.toFixed(0)}%</span>
                        <Badge variant={r.passed ? "success" : "error"}>{r.passed ? "Passed" : "Failed"}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-l-2 border-amber-400 py-1 pl-5">
            <h2 className="font-display text-base font-semibold text-gray-900">Exams are proctored</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
              <li>Allow your camera when asked.</li>
              <li>Stay on the exam tab and in fullscreen.</li>
              <li>Keep your face in view and your phone out of sight.</li>
            </ul>
            <p className="mt-3 text-xs text-gray-600">Video stays on your device. Only short event records are sent.</p>
          </section>
        </aside>
      </Reveal>
    </div>
  );
};
