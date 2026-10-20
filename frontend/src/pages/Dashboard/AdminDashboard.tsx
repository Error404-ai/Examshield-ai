/**
 * Admin Dashboard Page
 * Wide two-column layout: all exams on the left, drafts and a quick start
 * on the right.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { ExamCard } from "../../components/exam/ExamCard";
import { PageHeader } from "../../components/common/PageHeader";
import { Reveal } from "../../components/common/Motion";
import { StatStrip } from "../../components/common/Statstrip";
import { Button } from "../../components/common/Button";
import { Alert, Badge } from "../../components/common/Badge";
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

  const drafts = exams.filter((e) => !e.is_published);

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
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1500px] px-6 lg:px-12 py-10">
      <PageHeader
        eyebrow="Admin dashboard"
        title="Your exams, at a glance"
        subtitle="Manage exams and review student activity."
        actions={
          <Button size="lg" onClick={() => navigate("/admin/exams/new")}>
            Create exam
          </Button>
        }
      />

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

      <Reveal delay={0.2} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <h2 className="mb-4 border-b border-gray-200 pb-2 font-display text-xl font-semibold text-gray-900">
            All exams
          </h2>

          {exams.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center border-y border-gray-200 px-6 text-center">
              <p className="mb-4 text-gray-700">No exams created yet.</p>
              <Button onClick={() => navigate("/admin/exams/new")}>Create your first exam</Button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {exams.map((exam, i) => (
                <ExamCard
                  key={exam._id}
                  index={i}
                  exam={exam}
                  role={UserRole.ADMIN}
                  onEdit={(id) => navigate(`/admin/exams/${id}/edit`)}
                  onViewResults={(id) => navigate(`/admin/exams/${id}/review`)}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-8">
          <section className="relative overflow-hidden rounded-xl bg-navy-900 p-6 text-slate-200">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_12rem_at_100%_0%,rgba(34,211,238,0.16),transparent_70%)]"
            />
            <div className="relative">
              <h2 className="font-display text-lg font-medium text-white">Build an exam faster</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Give the AI a topic, a difficulty and optional study notes. It drafts multiple-choice questions
                for you to review and edit.
              </p>
              <button
                type="button"
                onClick={() => navigate("/admin/exams/new")}
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-medium text-navy-950 transition-colors hover:bg-white"
              >
                Generate with AI
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-3 border-b border-gray-200 pb-2 font-display text-xl font-semibold text-gray-900">
              Drafts
            </h2>
            {drafts.length === 0 ? (
              <p className="border-y border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                No unpublished exams.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200 border-y border-gray-200">
                {drafts.map((e) => (
                  <li key={e._id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/exams/${e._id}/edit`)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="truncate text-sm font-medium text-gray-900">{e.title}</span>
                      <Badge variant="neutral">Draft</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </Reveal>
    </div>
  );
};
