/**
 * QuestionCard Component
 * One question in a plain reading column, with options as selectable rows.
 */

import React from "react";
import { Question, QuestionType, StudentAnswer } from "../../types";

interface QuestionCardProps {
  question: Question;
  index: number;
  answer?: string;
  onAnswer: (answer: StudentAnswer) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, answer, onAnswer }) => {
  const handleSelect = (value: string) => {
    onAnswer({ question_id: question._id, selected_answer: value });
  };

  const isChoice =
    question.question_type === QuestionType.MCQ || question.question_type === QuestionType.TRUE_FALSE;
  const isText =
    question.question_type === QuestionType.SHORT_ANSWER || question.question_type === QuestionType.ESSAY;

  return (
    <section aria-labelledby={`q-${question._id}`}>
      <p className="text-sm text-gray-500">
        Question {index + 1} <span aria-hidden="true">·</span> {question.marks} mark{question.marks > 1 ? "s" : ""}
      </p>
      <h2
        id={`q-${question._id}`}
        className="mt-2 font-display text-2xl font-medium leading-snug text-gray-900"
      >
        {question.question_text}
      </h2>

      {isChoice && question.options && (
        <div role="radiogroup" className="mt-6 flex flex-col gap-2">
          {question.options.map((option, i) => {
            const selected = answer === option;
            return (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  selected
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question._id}`}
                  value={option}
                  checked={selected}
                  onChange={() => handleSelect(option)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="text-base text-gray-800">{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {isText && (
        <textarea
          rows={question.question_type === QuestionType.ESSAY ? 8 : 3}
          value={answer || ""}
          onChange={(e) => handleSelect(e.target.value)}
          placeholder="Type your answer here"
          className="mt-6 w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
        />
      )}
    </section>
  );
};