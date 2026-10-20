/**
 * ExamCard Component
 * Rendered as a list row for both admin and student views.
 * Put rows inside a <ul className="divide-y ... border ..."> container.
 */

import React from "react";
import { motion } from "framer-motion";
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
  index?: number; // position in the list, used to stagger the entrance
}

export const ExamCard: React.FC<ExamCardProps> = ({
  exam,
  role,
  onStart,
  onEdit,
  onDelete,
  onViewResults,
  index = 0,
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

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25 + Math.min(index, 8) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col gap-4 px-6 py-5 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-indigo-600 transition-transform duration-300 group-hover:scale-y-100"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-medium text-gray-900">{exam.title}</h3>
          {statusBadge()}
        </div>
        {exam.description && <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">{exam.description}</p>}
        <p className="mt-1 text-sm tabular-nums text-gray-500">
          {formatDuration(exam.duration)} · {exam.total_marks} marks · pass at {exam.passing_marks}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        {isAdmin ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onEdit?.(exam._id)}>
              Edit
            </Button>
            <Button size="sm" variant="primary" onClick={() => onViewResults?.(exam._id)}>
              Results
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDelete?.(exam._id)}>
              Delete
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant={finished ? "secondary" : "primary"}
            onClick={() => onStart?.(exam._id)}
            disabled={finished}
          >
            {finished ? "Submitted" : exam.attempted ? "Resume exam" : "Start exam"}
          </Button>
        )}
      </div>
    </motion.li>
  );
};