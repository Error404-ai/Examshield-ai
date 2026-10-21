/**
 * Review Attempt Page (admin)
 * One finished attempt: the written answers with the AI's marks and comments,
 * where the examiner can change any mark. Route: /admin/sessions/:sessionId/review
 *
 * The page refreshes itself while the AI is still grading.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { gradingService, ReviewAnswer, ReviewSession } from "../../services/gradingService";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { PageHeader } from "../../components/common/PageHeader";
import { StatStrip } from "../../components/common/Statstrip";
import { ALERT_TYPE_LABEL } from "../../services/integrityService";
import { formatDateTime, getErrorMessage } from "../../utils";

const isWritten = (a: ReviewAnswer) =>
  a.question_type === "short_answer" || a.question_type === "essay";

interface Draft {
  marks: string;
  note: string;
  dirty: boolean; // edited by the examiner and not saved yet: never overwritten by a reload
}

const POLL_MS = 4000;

export const ReviewAttemptPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<ReviewSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!sessionId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const session = await gradingService.review(sessionId);
      setData(session);
      setError("");
      setDrafts((prev) => {
        const next = { ...prev };
        for (const a of session.answers.filter(isWritten)) {
          if (!next[a.question_id]?.dirty) {
            next[a.question_id] = {
              marks: String(a.marks_awarded),
              note: a.examiner_note ?? "",
              dirty: false,
            };
          }
        }
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      loadingRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    setData(null);
    setDrafts({});
    setError("");
    load();
  }, [load]);

  // Keep checking while grading is pending. load() prevents overlapping requests.
  useEffect(() => {
    if (data?.grading_status !== "pending") return;
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [data?.grading_status, load]);

  const edit = (qid: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch, dirty: true } }));

  const save = async (a: ReviewAnswer) => {
    if (!sessionId) return;
    const d = drafts[a.question_id];
    if (!d) return;
    const marks = Number(d.marks);
    if (d.marks.trim() === "" || !Number.isFinite(marks) || marks < 0 || marks > a.marks) {
      setError(`Marks must be a number from 0 to ${a.marks}`);
      return;
    }
    setSavingId(a.question_id);
    setError("");
    setNotice("");
    try {
      await gradingService.gradeAnswer(sessionId, a.question_id, marks, d.note);
      setDrafts((prev) => ({ ...prev, [a.question_id]: { ...prev[a.question_id], dirty: false } }));
      setNotice("Marks saved.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const regrade = async () => {
    if (!sessionId) return;
    setError("");
    setNotice("");
    try {
      await gradingService.regrade(sessionId);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!data) {
    return error ? (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
          <p role="alert" className="text-red-700">{error}</p>
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
      </div>
    ) : (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const written = data.answers.filter(isWritten);
  const mcq = data.answers.filter((a) => !isWritten(a));
  const mcqCorrect = mcq.filter((a) => a.is_correct).length;
  const flagged = written.filter((a) => a.needs_review).length;
  const finalScore = !data.grading_status || data.grading_status === "done";

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-10 lg:px-12">
      <PageHeader
        className="mb-8"
        eyebrow="Attempt review"
        title={data.exam_title}
        subtitle={
          <>
            {data.student_name} <span className="text-gray-500">({data.student_email})</span>
            {data.submitted_at && <> · Submitted {formatDateTime(data.submitted_at)}</>}
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => navigate(`/admin/exams/${data.exam_id}/results`)}>
            Back to results
          </Button>
        }
      />

      <StatStrip
        items={[
          { label: "Score", value: `${data.score}/${data.total_marks}`, hint: `${data.percentage.toFixed(1)}%` },
          { label: "Outcome", value: finalScore ? (data.passed ? "Passed" : "Failed") : "Pending" },
          { label: "Multiple choice", value: `${mcqCorrect}/${mcq.length}`, hint: "correct answers" },
          { label: "Proctoring alerts", value: data.proctoring_alerts?.length ?? 0 },
        ]}
      />

      {/* Grading status */}
      {data.grading_status === "pending" && (
        <div role="status" className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          The AI is grading the written answers. This page updates by itself.
        </div>
      )}
      {data.grading_status === "failed" && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{data.grading_error || "AI grading did not finish."}</p>
          <p className="mt-0.5">You can run it again, or set the marks by hand below.</p>
          <button
            onClick={regrade}
            className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
          >
            Run AI grading again
          </button>
        </div>
      )}
      {data.grading_status === "done" && flagged > 0 && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          {flagged} answer(s) were flagged because the AI was not confident. Please check them.
        </div>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {notice && (
        <div role="status" className="mt-6 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold text-gray-900">Multiple-choice answers</h2>
        {mcq.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
            This attempt has no multiple-choice answers.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {mcq.map((answer, index) => (
              <article key={answer.question_id} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-relaxed text-gray-900">
                    {index + 1}. {answer.question_text}
                  </h3>
                  <Badge variant={answer.is_correct ? "success" : "error"}>
                    {answer.is_correct ? "Correct" : "Incorrect"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Student answer</p>
                    <p className="mt-1 break-words text-gray-900">{answer.selected_answer || "No answer"}</p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Correct answer</p>
                    <p className="mt-1 break-words text-gray-900">{answer.correct_answer}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-gray-900">Proctoring timeline</h2>
            <p className="mt-1 text-sm text-gray-600">
              Events recorded during this attempt. Alerts are review signals, not proof of misconduct.
            </p>
          </div>
          <span className="text-sm text-gray-500">{data.proctoring_alerts?.length ?? 0} events</span>
        </div>
        {!data.proctoring_alerts?.length ? (
          <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
            No proctoring events were recorded for this attempt.
          </p>
        ) : (
          <ol className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {data.proctoring_alerts.map((alert, index) => (
              <li key={`${alert.timestamp}-${index}`} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    alert.severity === "critical" ? "bg-rose-500" :
                    alert.severity === "high" ? "bg-orange-500" :
                    alert.severity === "medium" ? "bg-amber-500" : "bg-sky-500"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {alert.description || ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {ALERT_TYPE_LABEL[alert.alert_type] || alert.alert_type} · {alert.severity} · {formatDateTime(alert.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {written.length === 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl font-semibold text-gray-900">Written answers</h2>
          <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
            This attempt has no written answers.
          </p>
        </section>
      ) : (
        <section className="mt-10 flex flex-col gap-5">
          <h2 className="font-display text-2xl font-semibold text-gray-900">Written answers ({written.length})</h2>

          {written.map((a, i) => {
            const d = drafts[a.question_id] ?? { marks: String(a.marks_awarded), note: "", dirty: false };
            const waiting = a.grading === "pending";
            return (
              <div
                key={a.question_id}
                className={`bg-white rounded-lg border p-5 flex flex-col gap-3 ${
                  a.needs_review ? "border-yellow-300" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-gray-900">
                    {i + 1}. {a.question_text}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.needs_review && <Badge variant="warning">Needs review</Badge>}
                    <Badge variant={a.grading === "manual" ? "violet" : "neutral"}>
                      {a.grading === "manual"
                        ? "Marked by examiner"
                        : a.grading === "ai"
                        ? `AI-graded${a.confidence ? ` · ${a.confidence} confidence` : ""}`
                        : a.grading === "pending"
                        ? "Waiting for AI"
                        : a.grading === "failed"
                        ? "Not graded"
                        : "No answer"}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Student's answer
                  </p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words rounded-lg bg-gray-50 border border-gray-200 p-3">
                    {a.selected_answer.trim() ? a.selected_answer : "(No answer)"}
                  </p>
                </div>

                <details className="text-sm text-gray-700">
                  <summary className="cursor-pointer text-indigo-700">Model answer and marking guide</summary>
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="whitespace-pre-wrap break-words">
                      <span className="font-medium">Model answer: </span>
                      {a.correct_answer}
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      <span className="font-medium">Rubric: </span>
                      {a.rubric?.trim() ? a.rubric : "(none)"}
                    </p>
                  </div>
                </details>

                {a.feedback && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">AI comment: </span>
                    {a.feedback}
                  </p>
                )}

                <div className="flex flex-wrap items-end gap-3 border-t border-gray-200 pt-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Marks (out of {a.marks})</label>
                    <input
                      type="number"
                      min={0}
                      max={a.marks}
                      step={0.5}
                      value={d.marks}
                      disabled={waiting || savingId === a.question_id}
                      onChange={(e) => edit(a.question_id, { marks: e.target.value })}
                      className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <label className="block text-xs text-gray-600 mb-1">Note (optional)</label>
                    <input
                      type="text"
                      maxLength={500}
                      value={d.note}
                      disabled={waiting || savingId === a.question_id}
                      onChange={(e) => edit(a.question_id, { note: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={() => save(a)}
                    disabled={waiting || !d.dirty || savingId === a.question_id}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingId === a.question_id ? "Saving..." : "Save marks"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};
