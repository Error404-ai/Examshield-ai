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
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="text-gray-900 font-medium">{question.question_text}</p>
          <p className="text-xs text-gray-400 mt-1">{question.marks} mark{question.marks > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* MCQ / True-False */}
      {(question.question_type === QuestionType.MCQ ||
        question.question_type === QuestionType.TRUE_FALSE) &&
        question.options && (
          <div className="flex flex-col gap-2 ml-10">
            {question.options.map((option, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  answer === option
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question._id}`}
                  value={option}
                  checked={answer === option}
                  onChange={() => handleSelect(option)}
                  className="h-4 w-4 text-indigo-600"
                />
                <span className="text-sm text-gray-700">{option}</span>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
      )}
    </div>
  );
};