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
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

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
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900">{isEdit ? "Edit Exam" : "Create Exam"}</h1>
      <p className="text-gray-500 mt-1 mb-6">
        {isEdit
          ? "Update details, edit or remove questions, or add new ones"
          : "Set up the exam details and add multiple-choice questions"}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Data Structures Midterm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input type="number" min={1} className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passing percentage</label>
            <input type="number" min={0} max={100} className={inputClass} value={passingPct} onChange={(e) => setPassingPct(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Questions */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Questions ({questions.length})</h2>
      <div className="flex flex-col gap-4 mb-4">
        {questions.map((q, qi) => (
          <div key={q.id ?? `new-${qi}`} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Question {qi + 1}</p>
              {questions.length > 1 && (
                <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => removeQuestion(qi)}>
                  Remove
                </button>
              )}
            </div>
            <textarea className={inputClass} rows={2} placeholder="Question text" value={q.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })} />
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={q.correct === oi}
                  onChange={() => updateQuestion(qi, { correct: oi })}
                  title="Mark as correct answer"
                />
                <input className={inputClass} placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Marks</label>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                value={q.marks}
                onChange={(e) => updateQuestion(qi, { marks: Number(e.target.value) })}
              />
              <span className="text-xs text-gray-400 ml-2">Select the radio button next to the correct option</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mb-8 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
      >
        + Add question
      </button>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          {isEdit ? "Published (students can see it)" : "Publish immediately (students can see it)"}
        </label>
        <div className="flex gap-3">
          <button type="button" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700" onClick={() => navigate("/admin/dashboard")}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Exam"}
          </button>
        </div>
      </div>
    </div>
  );
};