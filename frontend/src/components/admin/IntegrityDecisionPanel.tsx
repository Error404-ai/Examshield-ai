/**
 * IntegrityDecisionPanel
 * The examiner's side of one flagged session: confirm or dismiss the flag,
 * answer a student's appeal, and read the audit trail.
 * Give it key={detail.session_id} so the note resets when another session opens.
 */

import React, { useState } from "react";
import { Button } from "../common/Button";
import { Alert, Badge } from "../common/Badge";
import { integrityService, STATUS_LABEL, STATUS_VARIANT } from "../../services/integrityService";
import type { SessionAlertsDetail } from "../../services/proctoringService";
import { formatDateTime, getErrorMessage } from "../../utils";

interface Props {
  detail: SessionAlertsDetail;
  onChanged: () => void;
}

const noteClass =
  "w-full resize-none border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-0";

const ACTION_LABEL: Record<string, string> = {
  confirmed: "Confirmed the flag",
  dismissed: "Dismissed the flag",
  appealed: "Student appealed",
  upheld: "Kept the flag after the appeal",
  overturned: "Removed the flag after the appeal",
};

export const IntegrityDecisionPanel: React.FC<Props> = ({ detail, onChanged }) => {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = detail.integrity_status;
  const info = detail.integrity;
  const sessionId = detail.session_id;
  const noteOk = note.trim().length >= 5;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setNote("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === null) {
    return <p className="text-sm text-gray-500">Decisions open once the student submits the exam.</p>;
  }

  return (
    <section aria-label="Integrity decision" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-base font-semibold text-gray-900">Integrity decision</h3>
        <Badge variant={STATUS_VARIANT[status]} dot>
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {status === "clear" && (
        <p className="text-sm text-gray-600">The risk score is below the review threshold, so nothing needs a decision.</p>
      )}

      {status === "pending" && (
        <div className="flex flex-col gap-4">
          <p className="max-w-xl text-sm leading-relaxed text-gray-600">
            The score is a hint, not a verdict. Read the timeline, then confirm the flag if you believe the rules were
            broken. A confirmed flag is shown to the student, who can appeal it. A dismissed flag is not.
          </p>
          <div>
            <label htmlFor="integrity-note" className="mb-1 block text-sm font-medium text-gray-800">
              Note
            </label>
            <textarea
              id="integrity-note"
              rows={2}
              maxLength={1000}
              className={noteClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Required to confirm. The student will read it."
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              loading={busy}
              disabled={!noteOk}
              onClick={() => run(() => integrityService.decide(sessionId, "confirmed", note.trim()))}
            >
              Confirm flag
            </Button>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => run(() => integrityService.decide(sessionId, "dismissed", note.trim()))}
            >
              Dismiss flag
            </Button>
          </div>
        </div>
      )}

      {status === "appealed" && info.appeal && (
        <div className="flex flex-col gap-4">
          <div className="border-l-2 border-indigo-300 pl-4">
            <p className="text-sm font-medium text-gray-900">
              The student&rsquo;s appeal
              {info.appeal.submitted_at && (
                <span className="ml-2 font-normal text-gray-500">{formatDateTime(info.appeal.submitted_at)}</span>
              )}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{info.appeal.message}</p>
          </div>
          <div>
            <label htmlFor="appeal-note" className="mb-1 block text-sm font-medium text-gray-800">
              Your answer
            </label>
            <textarea
              id="appeal-note"
              rows={2}
              maxLength={1000}
              className={noteClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Required. The student will read it."
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              loading={busy}
              disabled={!noteOk}
              onClick={() => run(() => integrityService.resolveAppeal(sessionId, "upheld", note.trim()))}
            >
              Keep the flag
            </Button>
            <Button
              loading={busy}
              disabled={!noteOk}
              onClick={() => run(() => integrityService.resolveAppeal(sessionId, "overturned", note.trim()))}
            >
              Remove the flag
            </Button>
          </div>
        </div>
      )}

      {(status === "confirmed" || status === "dismissed" || status === "upheld" || status === "overturned") && (
        <div className="text-sm leading-relaxed text-gray-700">
          {info.decision_note && <p className="whitespace-pre-wrap">{info.decision_note}</p>}
          {status === "confirmed" && info.appeal_deadline && (
            <p className="mt-1 text-gray-500">The student can appeal until {formatDateTime(info.appeal_deadline)}.</p>
          )}
          {info.appeal?.response_note && (
            <p className="mt-2 border-l-2 border-gray-300 pl-3 text-gray-600">{info.appeal.response_note}</p>
          )}
        </div>
      )}

      {info.history && info.history.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">History</h4>
          <ol className="divide-y divide-gray-200 border-y border-gray-200">
            {info.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="py-2.5 text-sm">
                <p className="text-gray-900">
                  {ACTION_LABEL[h.action] ?? h.action}
                  <span className="ml-2 text-xs text-gray-500">
                    {h.by}
                    {h.at ? `, ${formatDateTime(h.at)}` : ""}
                  </span>
                </p>
                {h.note && <p className="mt-0.5 whitespace-pre-wrap text-gray-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};
