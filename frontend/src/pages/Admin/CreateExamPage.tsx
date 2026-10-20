/**
 * Create / Edit Exam Page (admin)
 * One form for both routes:
 *   /admin/exams/new            -> create
 *   /admin/exams/:examId/edit   -> edit
 */

import { PageHeader } from "../../components/common/PageHeader";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminService, Difficulty } from "../../services/examService";
import { QuestionType } from "../../types";
import { getErrorMessage } from "../../utils";

interface DraftQuestion {
  id?: string; // present for questions that already exist on the server
  text: string;
  options: string[];
  correct: number;
  marks: number;
  ai?: boolean; // drafted by the AI generator
  explanation?: string; // shown to the admin only, never stored
}

const emptyQuestion = (): DraftQuestion => ({
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  marks: 1,
});

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20";

const labelClass = "mb-1 block text-sm font-medium text-gray-800";

const isBlank = (q: DraftQuestion) => !q.text.trim() && q.options.every((o) => !o.trim());

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

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

  // AI generator
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>("medium");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNote, setAiNote] = useState("");

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

  const handleGenerate = async () => {
    setAiError("");
    setAiNote("");
    if (aiTopic.trim().length < 3) {
      setAiError("Enter a topic (at least 3 characters)");
      return;
    }
    const count = Math.min(15, Math.max(1, Math.round(aiCount) || 5));
    setAiLoading(true);
    try {
      const generated = await adminService.generateQuestions({
        topic: aiTopic.trim(),
        count,
        difficulty: aiDifficulty,
        context: aiContext.trim() || undefined,
      });
      const drafts: DraftQuestion[] = generated.map((g) => ({
        text: g.question_text,
        options: g.options,
        correct: g.correct_index,
        marks: 1,
        ai: true,
        explanation: g.explanation,
      }));
      // Replace the untouched starter question, otherwise append
      setQuestions((qs) => (qs.length === 1 && isBlank(qs[0]) ? drafts : [...qs, ...drafts]));
      setAiNote(
        `Added ${drafts.length} AI-drafted question${drafts.length === 1 ? "" : "s"}. Review each one before saving.`
      );
    } catch (err) {
      setAiError(getErrorMessage(err));
    } finally {
      setAiLoading(false);
    }
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader
        className="mb-8"
        eyebrow={isEdit ? "Edit exam" : "New exam"}
        title={isEdit ? "Edit exam" : "Create an exam"}
        subtitle={
          isEdit
            ? "Update details, edit or remove questions, or add new ones."
            : "Set up the details, then write questions or let the AI draft them."
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mb-6 grid items-stretch gap-6 lg:grid-cols-2">
      {/* Details */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Data Structures Midterm"
          />
        </div>
        <div className="flex flex-1 flex-col">
          <label className={labelClass}>Description</label>
          <textarea
            className={`${inputClass} min-h-[96px] flex-1 resize-none`}
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

      {/* AI generator */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-gray-900">Generate with AI</h2>
            <p className="text-sm text-gray-500">
              Draft multiple-choice questions, then review and edit them below.
            </p>
          </div>
          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
            AI
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>Topic</label>
            <input
              className={inputClass}
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="e.g. Binary trees and traversal"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Number of questions (1-15)</label>
              <input
                type="number"
                min={1}
                max={15}
                className={inputClass}
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Difficulty</label>
              <div className="flex gap-1 rounded-lg border border-gray-300 bg-white p-1">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setAiDifficulty(d.id)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      aiDifficulty === d.id
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Study material <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <textarea
              className={inputClass}
              rows={3}
              maxLength={6000}
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              placeholder="Paste notes or a passage. Questions will be based only on this text."
            />
            <p className="mt-1 text-right text-xs text-gray-500">{aiContext.length} / 6000</p>
          </div>

          {aiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{aiError}</p>
            </div>
          )}
          {aiNote && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">{aiNote}</p>
            </div>
          )}

          <div>
            <button
              type="button"
              disabled={aiLoading}
              onClick={handleGenerate}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {aiLoading ? "Generating... this can take up to a minute" : "Generate questions"}
            </button>
          </div>
        </div>
      </div>

      </div>

      {/* Questions */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold text-gray-900">Questions ({questions.length})</h2>
        <p className="text-sm text-gray-500">
          Total marks: {questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0)}
        </p>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {questions.map((q, qi) => (
          <div key={q.id ?? `new-${qi}`} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                Question {qi + 1}
                {q.ai && (
                  <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-800">
                    AI draft
                  </span>
                )}
              </p>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="text-sm font-medium text-red-700 hover:text-red-900"
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
                  className="accent-indigo-600"
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
              <label className="text-sm text-gray-600">Marks</label>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                value={q.marks}
                onChange={(e) => updateQuestion(qi, { marks: Number(e.target.value) })}
              />
              <span className="ml-2 text-xs text-gray-500">Select the radio button next to the correct option</span>
            </div>
            {q.explanation && (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span className="font-medium text-gray-800">Why: </span>
                {q.explanation}
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mb-8 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
      >
        + Add question
      </button>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="accent-indigo-600"
          />
          {isEdit ? "Published (students can see it)" : "Publish immediately (students can see it)"}
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
            onClick={() => navigate("/admin/dashboard")}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Exam"}
          </button>
        </div>
      </div>
    </div>
  );
};