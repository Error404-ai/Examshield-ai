/**
 * Create / Edit Exam Page (admin)
 * One form for both routes:
 *   /admin/exams/new            -> create
 *   /admin/exams/:examId/edit   -> edit
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminService } from "../../services/examService";
import { QuestionType } from "../../types";
import { getErrorMessage } from "../../utils";

interface DraftQuestion {
  id?: string; // present for questions that already exist on the server
  text: string;
  options: string[];
  correct: number;
  marks: number;
}

const emptyQuestion = (): DraftQuestion => ({
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  marks: 1,
});

const inputClass =
  "w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet/60 focus:outline-none";

const labelClass = "mb-1 block text-sm font-medium text-slate-300";

export const CreateExamPage: React.FC = () => {
  const navigate = useNavigate();
  const { examId } = useParams<{ examId: string }>();
  const isEdit = !!examId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [passingPct, setPassingPct] = useState(40);
  const [publish, setPublish] = useState(!isEdit);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Load existing exam when editing
  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const { exam, questions: qs } = await adminService.getExam(examId);
        setTitle(exam.title);
        setDescription(exam.description ?? "");
        setDuration(exam.duration);
        setPublish(exam.is_published);
        setPassingPct(
          exam.total_marks > 0 ? Math.round((exam.passing_marks * 100) / exam.total_marks) : 40
        );
        setQuestions(
          qs.length
            ? qs.map((q) => {
                const opts = q.options?.length ? q.options : ["", "", "", ""];
                const idx = opts.indexOf(q.correct_answer ?? "");
                return {
                  id: q._id,
                  text: q.question_text,
                  options: opts,
                  correct: idx >= 0 ? idx : 0,
                  marks: q.marks,
                };
              })
            : [emptyQuestion()]
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const updateQuestion = (i: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const updateOption = (qi: number, oi: number, value: string) =>
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
      )
    );

  const removeQuestion = (i: number) => {
    const q = questions[i];
    if (q.id) setDeletedIds((ids) => [...ids, q.id!]);
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  };

  const validate = (): string => {
    if (title.trim().length < 5) return "Title must be at least 5 characters";
    if (duration < 1) return "Duration must be at least 1 minute";
    if (questions.length === 0) return "Add at least one question";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return `Question ${i + 1} is empty`;
      if (q.options.some((o) => !o.trim())) return `Fill all options in question ${i + 1}`;
      if (q.marks < 1) return `Question ${i + 1} needs at least 1 mark`;
    }
    return "";
  };

  const questionPayload = (examIdValue: string, q: DraftQuestion) => ({
    exam_id: examIdValue,
    question_text: q.text.trim(),
    question_type: QuestionType.MCQ,
    options: q.options.map((o) => o.trim()),
    correct_answer: q.options[q.correct].trim(),
    marks: q.marks,
  });

  const saveQuestionUpdate = async (questionId: string, payload: ReturnType<typeof questionPayload>) => {
    const service = adminService as typeof adminService & {
      updateQuestion?: (id: string, payload: ReturnType<typeof questionPayload>) => Promise<unknown>;
    };

    if (!service.updateQuestion) {
      throw new Error("Question update API is unavailable.");
    }

    return service.updateQuestion(questionId, payload);
  };

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const passingMarks = Math.ceil((totalMarks * passingPct) / 100);

    try {
      if (isEdit && examId) {
        // Questions first (backend recalculates total_marks), exam fields last
        for (const id of deletedIds) await adminService.deleteQuestion(id);
        for (const q of questions) {
          if (q.id) await saveQuestionUpdate(q.id, questionPayload(examId, q));
          else await adminService.addQuestion(questionPayload(examId, q));
        }
        await adminService.updateExam(examId, {
          title: title.trim(),
          description: description.trim(),
          duration,
          passing_marks: passingMarks,
          is_published: publish,
        });
      } else {
        const { exam_id } = await adminService.createExam({
          title: title.trim(),
          description: description.trim(),
          duration,
          total_marks: 0,
          passing_marks: 0,
        });
        for (const q of questions) {
          await adminService.addQuestion(questionPayload(exam_id, q));
        }
        await adminService.updateExam(exam_id, { passing_marks: passingMarks });
        if (publish) await adminService.publishExam(exam_id);
      }
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-3xl font-bold text-slate-50">{isEdit ? "Edit Exam" : "Create Exam"}</h1>
      <p className="mb-6 mt-1 text-slate-400">
        {isEdit
          ? "Update details, edit or remove questions, or add new ones"
          : "Set up the exam details and add multiple-choice questions"}
      </p>

      {error && (
        <div className="glass-rose mb-6 rounded-xl p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {/* Details */}
      <div className="glass mb-6 flex flex-col gap-4 rounded-2xl p-6">
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Data Structures Midterm"
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={inputClass}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Duration (minutes)</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Passing percentage</label>
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={passingPct}
              onChange={(e) => setPassingPct(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      <h2 className="mb-3 font-display text-xl font-bold text-slate-100">Questions ({questions.length})</h2>
      <div className="mb-4 flex flex-col gap-4">
        {questions.map((q, qi) => (
          <div key={q.id ?? `new-${qi}`} className="glass flex flex-col gap-3 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Question {qi + 1}</p>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="text-sm text-rose-400 hover:text-rose-300"
                  onClick={() => removeQuestion(qi)}
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Question text"
              value={q.text}
              onChange={(e) => updateQuestion(qi, { text: e.target.value })}
            />
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={q.correct === oi}
                  onChange={() => updateQuestion(qi, { correct: oi })}
                  title="Mark as correct answer"
                  className="accent-violet"
                />
                <input
                  className={inputClass}
                  placeholder={`Option ${oi + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(qi, oi, e.target.value)}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">Marks</label>
              <input
                type="number"
                min={1}
                className="w-20 rounded-xl border border-white/10 bg-navy-800 px-3 py-2 text-sm text-slate-100 focus:border-violet/60 focus:outline-none"
                value={q.marks}
                onChange={(e) => updateQuestion(qi, { marks: Number(e.target.value) })}
              />
              <span className="ml-2 text-xs text-slate-500">Select the radio button next to the correct option</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mb-8 rounded-xl border border-dashed border-white/20 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
      >
        + Add question
      </button>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="accent-violet"
          />
          {isEdit ? "Published (students can see it)" : "Publish immediately (students can see it)"}
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
            onClick={() => navigate("/admin/dashboard")}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-xl bg-violet px-5 py-2 text-sm font-medium text-white transition-all hover:bg-violet-400 hover:shadow-glow-violet disabled:opacity-50"
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Exam"}
          </button>
        </div>
      </div>
    </div>
  );
};