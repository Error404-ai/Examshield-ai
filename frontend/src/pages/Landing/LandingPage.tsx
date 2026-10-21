/**
 * Landing Page (logged-out visitors at "/")
 * One orchestrated moment: the live detection demo in the hero.
 * Everything else is static and quiet.
 */

import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import Lenis from "lenis";
import { ScanCanvas } from "../../components/landing/ScanCanvas";

// Values mirror backend/app/routes/proctoring.py (SEVERITY_WEIGHT) and
// frontend/src/hooks/useProctoring.ts (RULES, PHONE_*). Update all together.
// Face checks run every 500ms, so "about N seconds" = samples x 0.5s.
const SIGNALS = [
  { name: "More than one person", when: "A second face stays in view for about two seconds", severity: "Critical", weight: 15 },
  { name: "Camera turned off", when: "The video stream ends mid-exam", severity: "High", weight: 8 },
  { name: "No face in view", when: "Nobody is visible for about three seconds", severity: "High", weight: 8 },
  { name: "Phone in view", when: "A phone is seen in two checks in a row", severity: "High", weight: 8 },
  { name: "Left the exam tab", when: "The student switches tab or window. The third switch ends the exam", severity: "Medium", weight: 3 },
  { name: "Left fullscreen", when: "The student exits fullscreen mode", severity: "Medium", weight: 3 },
  { name: "Looking away", when: "The head or eyes stay turned from the screen for about three seconds", severity: "Medium", weight: 3 },
  { name: "Eyes closed", when: "Eyes stay closed for about four seconds", severity: "Low", weight: 1 },
];

const severityColor: Record<string, string> = {
  Critical: "text-rose",
  High: "text-amber",
  Medium: "text-cyan-400",
  Low: "text-slate-400",
};

const STEPS = [
  {
    title: "Camera check",
    body: "The questions stay hidden until the camera works. The student allows access once.",
  },
  {
    title: "Detection in the browser",
    body: "A face model checks the camera twice a second. A problem has to last a few seconds in a row before it counts, so a cough or a glance down doesn't flag anyone.",
  },
  {
    title: "Events go to the server, not video",
    body: "Each flag is a small record: what happened, how serious, and when.",
  },
  {
    title: "A report for the examiner",
    body: "Every session gets a suspicion score and a suggested outcome: approve, review or reject. A person makes the final call.",
  },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export const LandingPage: React.FC = () => {
  // Smooth scrolling, skipped when the user prefers reduced motion
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis();
    let id = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, []);

  const cta =
    "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900";

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-navy-900 text-slate-200 font-sans">
        {/* Top bar */}
        <header className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-navy-900/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6 lg:px-12">
            <span className="font-display text-lg font-semibold tracking-tight text-white">ExamShield</span>
            <nav className="flex items-center gap-2 text-sm">
              <Link to="/login" className="rounded-lg px-4 py-2 text-slate-300 hover:text-white">
                Sign in
              </Link>
              <Link to="/register" className={`${cta} bg-cyan-400 text-navy-950 hover:bg-white`}>
                Create account
              </Link>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto grid min-h-[100svh] max-w-[1500px] items-center gap-10 px-6 lg:px-12 pb-16 pt-28 lg:grid-cols-2">
          <div>
            <motion.h1
              {...fade(0)}
              className="font-display text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl"
            >
              Proctored exams without uploading a single frame of video.
            </motion.h1>
            <motion.p {...fade(0.15)} className="mt-6 max-w-md text-lg leading-relaxed text-slate-400">
              ExamShield checks the camera inside the student&rsquo;s browser and sends the examiner only short event
              records. Move your cursor over the face to see what it watches for.
            </motion.p>
            <motion.div {...fade(0.3)} className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className={`${cta} bg-cyan-400 text-navy-950 hover:bg-white`}>
                Create an account
              </Link>
              <Link to="/login" className={`${cta} border border-white/15 text-white hover:bg-white/5`}>
                Sign in
              </Link>
            </motion.div>
          </div>

          <motion.div {...fade(0.2)} className="h-[420px] w-full sm:h-[520px] lg:h-[calc(100svh-9rem)]">
            <ScanCanvas className="h-full w-full" />
          </motion.div>
        </section>

        {/* What gets flagged */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-[1500px] px-6 lg:px-12 py-24">
            <h2 className="max-w-xl font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">
              Eight things get flagged, each with a fixed weight
            </h2>
            <p className="mt-4 max-w-xl text-slate-400">
              Each flag adds its points to the session&rsquo;s suspicion score, capped at 100. Repeats of the same flag
              are rate-limited, so one long glance doesn&rsquo;t count fifty times. Below 20 is approve, 20 to 49 is
              review, 50 and above is reject.
            </p>

            <div className="mt-12 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-6 font-medium">Signal</th>
                    <th className="py-3 pr-6 font-medium">Triggered when</th>
                    <th className="py-3 pr-6 font-medium">Severity</th>
                    <th className="py-3 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {SIGNALS.map((s) => (
                    <tr key={s.name} className="border-b border-white/10">
                      <td className="py-4 pr-6 font-medium text-white">{s.name}</td>
                      <td className="max-w-sm py-4 pr-6 text-slate-400">{s.when}</td>
                      <td className={`py-4 pr-6 ${severityColor[s.severity]}`}>{s.severity}</td>
                      <td className="py-4 text-right tabular-nums text-slate-200">{s.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* How a session runs */}
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-[1500px] gap-12 px-6 lg:px-12 py-24 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-display text-3xl font-medium tracking-tight text-white sm:text-4xl lg:sticky lg:top-28 lg:self-start">
              How a session runs
            </h2>
            <ol className="divide-y divide-white/10 border-y border-white/10">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4 py-7">
                  <span className="font-display text-xl text-cyan-400 tabular-nums">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-xl font-medium text-white">{s.title}</h3>
                    <p className="mt-2 max-w-lg leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-[1500px] px-6 lg:px-12 py-28">
            <h2 className="max-w-2xl font-display text-3xl font-medium tracking-tight text-white sm:text-5xl">
              Set up your first exam in a few minutes.
            </h2>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className={`${cta} bg-cyan-400 text-navy-950 hover:bg-white`}>
                Create an account
              </Link>
              <Link to="/login" className={`${cta} border border-white/15 text-white hover:bg-white/5`}>
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 lg:px-12 py-8 text-sm text-slate-500">
            <span>ExamShield AI</span>
            <a
              href="https://github.com/Error404-ai/Examshield-ai"
              className="hover:text-slate-300"
              target="_blank"
              rel="noreferrer"
            >
              Source on GitHub
            </a>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
};