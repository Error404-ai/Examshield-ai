/**
 * Exam Page - Student takes exam with proctoring
 */

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { studentService } from "../../services/examService";
import { QuestionCard } from "../../components/exam/QuestionCard";
import { ProctoringOverlay } from "../../components/proctoring/ProctoringOverlay";
import { useProctoring } from "../../hooks/useProctoring";
import { useExamTimer } from "../../hooks/useExamTimer";
import { Question, Exam, SessionSubmit, StudentAnswer } from "../../types";
import { getErrorMessage } from "../../utils";

export const ExamPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { proctoringData, proctoringError, startProctoring, stopProctoring } = useProctoring(sessionId);
  const { timeLeft, isExpired, formatTime } = useExamTimer(exam?.duration || 0);

  // Load exam and questions
  useEffect(() => {
    const loadExam = async () => {
      if (!examId) return;
      try {
        setLoading(true);
        const examData = await studentService.getExam(examId);
        setExam(examData);
        const questionsData = await studentService.getExamQuestions(examId);
        setQuestions(questionsData);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    loadExam();
  }, [examId]);

  // Start session and proctoring
  useEffect(() => {
    const startSession = async () => {
      if (!examId) return;
      try {
        const session = await studentService.startExamSession(examId);
        setSessionId(session.session_id);
        startProctoring();
      } catch (err) {
        setError(getErrorMessage(err));
      }
    };
    if (questions.length > 0) {
      startSession();
    }
  }, [questions, examId, startProctoring]);

  // Handle timer expiry
  useEffect(() => {
    if (isExpired && sessionId) {
      handleSubmit();
    }
  }, [isExpired, sessionId]);

  const currentQuestion = questions[currentQuestionIndex];

  const handleAnswerChange = (answer: string) => {
    if (currentQuestion) {
      const newAnswers = new Map(answers);
      newAnswers.set(currentQuestion._id, answer);
      setAnswers(newAnswers);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const studentAnswers: StudentAnswer[] = Array.from(answers.entries()).map(([questionId, answer]) => ({
        question_id: questionId,
        selected_answer: answer,
      }));

      const payload: SessionSubmit = {
        session_id: sessionId,
        answers: studentAnswers,
      };

      await studentService.submitExam(payload);
      stopProctoring();
      navigate(`/student/results/${sessionId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Exam not found or no questions available</p>
          <button
            onClick={() => navigate("/student/dashboard")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ProctoringOverlay proctoringData={proctoringData} error={proctoringError} />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{exam.title}</h1>
            <p className="text-sm text-gray-500">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          <div className={`text-2xl font-bold ${timeLeft < 300 ? "text-red-600" : "text-gray-900"}`}>
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8 max-w-4xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            answer={answers.get(currentQuestion._id) || ""}
            onAnswerChange={handleAnswerChange}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>

          <div className="text-sm text-gray-600">
            {Array.from({ length: questions.length }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentQuestionIndex(i)}
                className={`mx-1 px-3 py-1 rounded ${
                  i === currentQuestionIndex
                    ? "bg-indigo-600 text-white"
                    : answers.has(questions[i]._id)
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-200 text-gray-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {currentQuestionIndex === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Exam"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};