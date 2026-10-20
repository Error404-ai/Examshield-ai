/**
 * useDraftSync
 * Keeps the student's answers safe across refreshes and brief disconnects:
 *  - every change is written to sessionStorage right away (this device)
 *  - after a short pause it is autosaved to the server
 *  - while offline nothing is sent; when the connection returns the latest
 *    answers are saved again
 *  - a failed save is retried every few seconds, except a 409 (session over)
 */

import { useEffect, useState } from "react";
import { studentService } from "../services/examService";

export type SyncState = "saved" | "saving" | "offline" | "error";

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export const draftKey = (sessionId: string) => `examshield:draft:${sessionId}`;

export const readLocalDraft = (sessionId: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(draftKey(sessionId)) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const clearLocalDraft = (sessionId: string) => {
  try {
    sessionStorage.removeItem(draftKey(sessionId));
  } catch {
    /* storage unavailable: nothing to clear */
  }
};

/**
 * @param enabled set to false once the exam is submitted so no late save fires
 */
export function useDraftSync(
  sessionId: string,
  answers: Record<string, string>,
  enabled: boolean = true
): { state: SyncState; online: boolean } {
  const online = useOnline();
  const [state, setState] = useState<SyncState>("saved");
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    try {
      sessionStorage.setItem(draftKey(sessionId), JSON.stringify(answers));
    } catch {
      /* private mode or full storage: the server copy still works */
    }

    if (!online) {
      setState("offline");
      return;
    }

    setState("saving");
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(async () => {
      try {
        await studentService.saveDraft(
          sessionId,
          Object.entries(answers).map(([question_id, selected_answer]) => ({
            question_id,
            selected_answer,
          }))
        );
        if (!cancelled) setState("saved");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 409) retry = setTimeout(() => setRetryTick((n) => n + 1), RETRY_MS);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [answers, online, sessionId, enabled, retryTick]);

  return { state, online };
}