/**
 * PreExamNotice Component
 * Shown before an exam starts. Explains in plain language what the proctoring
 * does with the student's camera and what happens automatically, and asks for
 * confirmation before the session (and its timer) starts.
 *
 * The list of checks and the tab limit come from services/policy.ts, the same
 * source the detection hook uses, so this text can't drift from what the code does.
 * The other statements here must stay true to the code:
 *  - face detection runs in the browser (hooks/useProctoring.ts); no video is uploaded
 *  - only small event records are sent to the server (routes/proctoring.py)
 */

import React, { useState } from "react";
import { Exam } from "../../types";
import { formatDuration } from "../../utils";
import { MAX_TAB_SWITCHES, SIGNALS } from "../../services/policy";

interface PreExamNoticeProps {
  exam: Exam;
  starting: boolean;
  error?: string;
  onAccept: () => void;
  onCancel: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t border-gray-200 pt-5">
    <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
    <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm text-gray-700">{children}</ul>
  </section>
);

export const PreExamNotice: React.FC<PreExamNoticeProps> = ({
  exam,
  starting,
  error,
  onAccept,
  onCancel,
}) => {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8 flex flex-col gap-5">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatDuration(exam.duration)} · {exam.total_marks} marks · pass at {exam.passing_marks}
          </p>
          <p className="text-sm text-gray-700 mt-3">
            This exam is proctored. Read how, then confirm to begin. The timer starts when you click
            the button below.
          </p>
        </header>

        <Section title="What the camera is used for">
          <li>Your camera stays on for the whole exam. You will see your own preview in the corner.</li>
          <li>
            Face detection runs inside your browser. Video is not uploaded, recorded or stored by
            ExamShield.
          </li>
          <li>
            The check watches for the following:
            <ul className="list-disc pl-5 mt-1.5 flex flex-col gap-1">
              {SIGNALS.map((s) => (
                <li key={s.type}>
                  <span className="font-medium">{s.label}.</span> {s.when}.
                </li>
              ))}
            </ul>
          </li>
          <li>
            When one of these happens, only a short record is sent to the server: the type of event
            and the time. Nothing else from your camera is sent.
          </li>
        </Section>

        <Section title="What happens automatically">
          <li>When the timer reaches zero, your answers are submitted for you.</li>
          <li>
            If you leave the exam tab {MAX_TAB_SWITCHES} times, the exam ends and your answers are
            submitted automatically.
          </li>
          <li>
            Your marks come only from your answers. Proctoring events are combined into a suspicion
            score that your examiner sees as a recommendation. It is not an automatic verdict.
          </li>
          <li>
            Detection can be wrong, and a flag is a hint for your examiner, not proof. Sit in good
            light, face the camera and keep your head roughly centred to avoid false flags.
          </li>
        </Section>

        <Section title="Before you start">
          <li>The exam opens in fullscreen. Leaving fullscreen is recorded, and you can return with one click.</li>
          <li>Right-click and the copy, paste, print, save and view-source shortcuts are disabled.</li>
          <li>
            If your browser closes or you refresh, reopen the exam from your dashboard. The timer
            keeps running and your saved answers come back.
          </li>
          <li>Your browser will ask for camera access next. You need to allow it to see the questions.</li>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-gray-800 border-t border-gray-200 pt-5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I have read this notice and I agree to be proctored through my camera and browser
            activity as described.
          </span>
        </label>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={starting}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Back to dashboard
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!agreed || starting}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start exam"}
          </button>
        </div>
      </div>
    </div>
  );
};