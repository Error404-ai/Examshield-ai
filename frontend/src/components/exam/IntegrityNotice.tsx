/**
 * IntegrityNotice
 * Shown on the student's result page, and only after an examiner has confirmed
 * a proctoring flag. Pending or dismissed flags render nothing. While the appeal
 * window is open the student can explain what happened.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../common/Button";
import { Alert } from "../common/Badge";
import { ALERT_TYPE_LABEL, integrityService, MyIntegrity } from "../../services/integrityService";
import { formatDateTime, getAlertSeverityColor, getErrorMessage } from "../../utils";

const MIN_APPEAL = 20;
const MAX_APPEAL = 1000;

const HEADING: Record<string, string> = {
  confirmed: "Your examiner confirmed a proctoring flag on this attempt",
  appealed: "Your appeal is with the examiner",
  upheld: "The examiner kept the flag after your appeal",
  overturned: "The examiner removed the flag after your appeal",
};

const BORDER: Record<string, string> = {
  confirmed: "border-red-500",
  appealed: "border-amber-400",
  upheld: "border-red-500",
  overturned: "border-green-600",
};

export const IntegrityNotice: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [data, setData] = useState<MyIntegrity | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    integrityService
      .getMine(sessionId)
      .then(setData)
      .catch(() => setData(null)); // the notice is optional: never block the result page
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || !data.flagged || !data.status) return null;

  const status = data.status;
  const trimmed = message.trim();
  const counts = Object.entries(data.counts ?? {});

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await integrityService.appeal(sessionId, trimmed));
      setMessage("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="integrity-heading"
      className={`mb-10 border-l-2 py-1 pl-5 ${BORDER[status] ?? "border-gray-300"}`}
    >
      <h2 id="integrity-heading" className="font-display text-lg font-semibold text-gray-900">
        {HEADING[status] ?? "Proctoring flag"}
      </h2>

      {data.decision_note && (
        <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          <span className="font-medium text-gray-900">Examiner&rsquo;s note: </span>
          {data.decision_note}
        </p>
      )}

      {counts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {counts.map(([type, n]) => (
            <span key={type} className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
              {ALERT_TYPE_LABEL[type] ?? type}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      )}

      {data.alerts && data.alerts.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-indigo-700 hover:text-indigo-900">
            See what was recorded ({data.alerts.length})
          </summary>
          <div className="mt-2 flex max-h-60 max-w-2xl flex-col gap-1.5 overflow-y-auto">
            {data.alerts.map((a, i) => (
              <div
                key={i}
                className={`flex flex-wrap items-center gap-x-3 rounded-md px-3 py-1.5 ${getAlertSeverityColor(a.severity)}`}
              >
                <span className="text-xs tabular-nums opacity-70">
                  {new Date(a.timestamp).toLocaleTimeString("en-IN")}
                </span>
                <span className="font-medium">{ALERT_TYPE_LABEL[a.alert_type] ?? a.alert_type}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {data.appeal && (
        <div className="mt-4 max-w-2xl text-sm leading-relaxed">
          <p className="text-gray-500">
            Your appeal{data.appeal.submitted_at ? `, ${formatDateTime(data.appeal.submitted_at)}` : ""}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-gray-800">{data.appeal.message}</p>
          {data.appeal.response_note && (
            <p className="mt-3 border-l-2 border-gray-300 pl-3 text-gray-700">
              <span className="font-medium text-gray-900">Examiner&rsquo;s answer: </span>
              {data.appeal.response_note}
            </p>
          )}
        </div>
      )}

      {status === "confirmed" && data.can_appeal && (
        <div className="mt-5 max-w-2xl">
          <label htmlFor="appeal-message" className="block text-sm font-medium text-gray-800">
            If this is wrong, tell your examiner what happened
          </label>
          <textarea
            id="appeal-message"
            rows={3}
            maxLength={MAX_APPEAL}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full resize-none border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-0"
            placeholder="For example: who walked into the frame, or why the camera dropped"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            <span>
              {trimmed.length < MIN_APPEAL
                ? `At least ${MIN_APPEAL} characters`
                : data.appeal_deadline
                ? `You can appeal until ${formatDateTime(data.appeal_deadline)}`
                : ""}
            </span>
            <span className="tabular-nums">
              {message.length} / {MAX_APPEAL}
            </span>
          </div>
          {error && (
            <div className="mt-3">
              <Alert variant="error" onDismiss={() => setError("")}>
                {error}
              </Alert>
            </div>
          )}
          <Button className="mt-3" loading={busy} disabled={trimmed.length < MIN_APPEAL} onClick={submit}>
            Submit appeal
          </Button>
        </div>
      )}

      {status === "confirmed" && !data.can_appeal && data.appeal_block_reason && (
        <p className="mt-4 text-sm text-gray-600">{data.appeal_block_reason}</p>
      )}
    </section>
  );
};
