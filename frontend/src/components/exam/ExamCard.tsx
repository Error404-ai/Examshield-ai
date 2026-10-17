/**
 * ExamCard Component
 * Displays exam summary for both admin and student views
 */

import React from "react";
import { Exam, SessionStatus, UserRole } from "../../types";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { formatDuration, getSessionStatusLabel } from "../../utils";

interface ExamCardProps {
  exam: Exam;
  role: UserRole;
  onStart?: (examId: string) => void;
  onEdit?: (examId: string) => void;
  onDelete?: (examId: string) => void;
  onViewResults?: (examId: string) => void;
}

export const ExamCard: React.FC<ExamCardProps> = ({
  exam,
  role,
  onStart,
  onEdit,
  onDelete,
  onViewResults,
}) => {
  const isAdmin = role === UserRole.ADMIN;

  const statusBadge = () => {
    if (isAdmin) {
      return exam.is_published ? (
        <Badge variant="success" dot>Published</Badge>
      ) : (
        <Badge variant="neutral">Draft</Badge>
      );
    }
    if (exam.attempted) {
      const color =
        exam.session_status === SessionStatus.SUBMITTED
          ? "success"
          : exam.session_status === SessionStatus.PROCTORING_FAILED
          ? "error"
          : "warning";
      return <Badge variant={color}>{getSessionStatusLabel(exam.session_status!)}</Badge>;
    }
    return <Badge variant="info" dot>Available</Badge>;
  };

  const submitted = exam.attempted && exam.session_status === SessionStatus.SUBMITTED;

  return (
    <div className="glass card-hover flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-slate-100">{exam.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{exam.description}</p>
        </div>
        <div className="shrink-0">{statusBadge()}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white/5 py-2">
          <p className="text-xs text-slate-500">Duration</p>
          <p className="text-sm font-semibold text-slate-100">{formatDuration(exam.duration)}</p>
        </div>
        <div className="rounded-xl bg-white/5 py-2">
          <p className="text-xs text-slate-500">Total Marks</p>
          <p className="text-sm font-semibold text-slate-100">{exam.total_marks}</p>
        </div>
        <div className="rounded-xl bg-white/5 py-2">
          <p className="text-xs text-slate-500">Passing</p>
          <p className="text-sm font-semibold text-slate-100">{exam.passing_marks}</p>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        {isAdmin ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onEdit?.(exam._id)} className="flex-1">
              Edit
            </Button>
            <Button size="sm" variant="primary" onClick={() => onViewResults?.(exam._id)} className="flex-1">
              Results
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDelete?.(exam._id)}>
              Delete
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onStart?.(exam._id)}
            disabled={submitted}
            className="w-full"
          >
            {submitted ? "Already Submitted" : exam.attempted ? "Resume Exam" : "Start Exam"}
          </Button>
        )}
      </div>
    </div>
  );
};