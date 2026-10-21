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
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700"
        >
          Back
        </button>
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
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{data.exam_title}</h1>
          <p className="text-gray-600 mt-1">
            {data.student_name} <span className="text-gray-400">({data.student_email})</span>
          </p>
          {data.submitted_at && (
            <p className="text-xs text-gray-500 mt-0.5">Submitted {formatDateTime(data.submitted_at)}</p>
          )}
        </div>
        <button
          onClick={() => navigate(-1)}
          className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-gray-600">Score</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {data.score} / {data.total_marks}{" "}
            <span className="text-base font-normal text-gray-500">({data.percentage.toFixed(1)}%)</span>
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Result</p>
          {finalScore ? (
            <Badge variant={data.passed ? "success" : "error"}>{data.passed ? "Passed" : "Failed"}</Badge>
          ) : (
            <Badge variant="warning">Provisional</Badge>
          )}
        </div>
        <div>
          <p className="text-sm text-gray-600">Multiple choice</p>
          <p className="text-sm font-medium text-gray-900">
            {mcqCorrect} of {mcq.length} correct
          </p>
        </div>
      </div>

      {/* Grading status */}
      {data.grading_status === "pending" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-900 mb-6">
          The AI is grading the written answers. This page updates by itself.
        </div>
      )}
      {data.grading_status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-6">
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-900 mb-6">
          {flagged} answer(s) were flagged because the AI was not confident. Please check them.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4">{error}</div>
      )}
      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 mb-4">
          {notice}
        </div>
      )}

      {written.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          This exam has no written answers. Multiple-choice answers are marked automatically.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900">Written answers ({written.length})</h2>

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
        </div>
      )}
    </div>
  );
};
