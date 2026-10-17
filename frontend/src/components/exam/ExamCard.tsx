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

  // A submitted or expired session can't be restarted (backend returns 400)
  const finished =
    !!exam.attempted &&
    (exam.session_status === SessionStatus.SUBMITTED ||
      exam.session_status === SessionStatus.EXPIRED);

  const statusBadge = () => {
    if (isAdmin) {
      return exam.is_published ? (
        <Badge variant="success">Published</Badge>
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
    return <Badge variant="info">Available</Badge>;
  };

  const tile = (label: string, value: string | number) => (
    <div className="rounded-xl bg-white/5 border border-white/10 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-slate-100 text-sm">{value}</p>
    </div>
  );

  return (
    <div className="glass card-hover rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100 text-base">{exam.title}</h3>
          <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{exam.description}</p>
        </div>
        {statusBadge()}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {tile("Duration", formatDuration(exam.duration))}
        {tile("Total Marks", exam.total_marks)}
        {tile("Passing", exam.passing_marks)}
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
            disabled={finished}
            className="w-full"
          >
            {finished ? "Already Submitted" : exam.attempted ? "Resume Exam" : "Start Exam"}
          </Button>
        )}
      </div>
    </div>
  );
};