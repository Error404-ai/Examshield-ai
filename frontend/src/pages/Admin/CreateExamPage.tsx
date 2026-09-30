/**
 * Create Exam Page (admin)
 * Creates the exam, adds MCQ questions, optionally publishes.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService } from "../../services/examService";
import { QuestionType } from "../../types";
import { getErrorMessage } from "../../utils";

interface DraftQuestion {
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
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export const CreateExamPage: React.FC = () => {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [passingPct, setPassingPct] = useState(40);
  const [publish, setPublish] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateQuestion = (i: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const updateOption = (qi: number, oi: number, value: string) =>
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
      )
    );

  const validate = (): string => {
    if (!title.trim()) return "Please enter an exam title";
    if (duration < 1) return "Duration must be at least 1 minute";
    if (questions.length === 0) return "Add at least one question";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return `Question ${i + 1} is empty`;
      if (q.options.some((o) => !o.trim())) return `Fill all 4 options in question ${i + 1}`;
      if (q.marks < 1) return `Question ${i + 1} needs at least 1 mark`;
    }
    return "";
  };

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const { exam_id } = await adminService.createExam({
        title: title.trim(),
        description: description.trim(),
        duration,
        total_marks: 0,
        passing_marks: 0,
      });

      for (const q of questions) {
        await adminService.addQuestion({
          exam_id,
          question_text: q.text.trim(),
          question_type: QuestionType.MCQ,
          options: q.options.map((o) => o.trim()),
          correct_answer: q.options[q.correct].trim(),
          marks: q.marks,
        });
      }

      const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      await adminService.updateExam(exam_id, {
        total_marks: totalMarks,
        passing_marks: Math.ceil((totalMarks * passingPct) / 100),
      });

      if (publish) await adminService.publishExam(exam_id);

      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900">Create Exam</h1>
      <p className="text-gray-500 mt-1 mb-6">Set up the exam details and add multiple-choice questions</p>

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
          <div key={qi} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Question {qi + 1}</p>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))}
                >
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
              <input type="number" min={1} className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm" value={q.marks} onChange={(e) => updateQuestion(qi, { marks: Number(e.target.value) })} />
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
          Publish immediately (students can see it)
        </label>
        <div className="flex gap-3">
          <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => navigate("/admin/dashboard")}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Create Exam"}
          </button>
        </div>
      </div>
    </div>
  );
};