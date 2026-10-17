/**
 * QuestionCard Component
 * Renders a single exam question with answer input
 */

import React from "react";
import { Question, QuestionType, StudentAnswer } from "../../types";

interface QuestionCardProps {
  question: Question;
  index: number;
  answer?: string;
  onAnswer: (answer: StudentAnswer) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  answer,
  onAnswer,
}) => {
  const handleSelect = (value: string) => {
    onAnswer({ question_id: question._id, selected_answer: value });
  };

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/20 text-sm font-semibold text-violet-300">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="font-medium text-slate-100">{question.question_text}</p>
          <p className="mt-1 text-xs text-slate-500">
            {question.marks} mark{question.marks > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* MCQ / True-False */}
      {(question.question_type === QuestionType.MCQ ||
        question.question_type === QuestionType.TRUE_FALSE) &&
        question.options && (
          <div className="ml-10 flex flex-col gap-2">
            {question.options.map((option, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  answer === option
                    ? "border-violet/60 bg-violet/10"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question._id}`}
                  value={option}
                  checked={answer === option}
                  onChange={() => handleSelect(option)}
                  className="h-4 w-4 accent-violet"
                />
                <span className="text-sm text-slate-200">{option}</span>
              </label>
            ))}
          </div>
        )}

      {/* Short Answer / Essay */}
      {(question.question_type === QuestionType.SHORT_ANSWER ||
        question.question_type === QuestionType.ESSAY) && (
        <div className="ml-10">
          <textarea
            rows={question.question_type === QuestionType.ESSAY ? 6 : 2}
            value={answer || ""}
            onChange={(e) => handleSelect(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full resize-none rounded-xl border border-white/10 bg-navy-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet/60 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};