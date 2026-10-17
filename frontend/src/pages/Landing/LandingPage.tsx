/**
 * Landing Page
 * Public home page shown to logged-out visitors.
 */

import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const features = [
  {
    icon: "👁️",
    title: "Gaze & eye tracking",
    text: "An in-browser face-landmark model flags a student looking away or keeping their eyes closed for too long.",
  },
  {
    icon: "👥",
    title: "Multi-face detection",
    text: "A second person entering the camera frame is flagged within seconds and marked critical.",
  },
  {
    icon: "🪟",
    title: "Tab & fullscreen lock",
    text: "Tab switches and fullscreen exits are logged. Repeated switching submits the exam automatically.",
  },
  {
    icon: "📊",
    title: "Live risk scoring",
    text: "Every alert is weighted into a 0–100 suspicion score with a clear clear / review / high-risk call.",
  },
  {
    icon: "🔒",
    title: "Privacy-first",
    text: "Video is analysed on the student's own device and is never uploaded. Only short event notes reach the examiner.",
  },
  {
    icon: "⚡",
    title: "Auto-graded results",
    text: "Instant scoring with a full answer review for students, and a per-exam results table for admins.",
  },
];

const steps = [
  {
    n: "01",
    title: "Create the exam",
    text: "Admins build a multiple-choice exam, set the duration and passing mark, and publish it.",
  },
  {
    n: "02",
    title: "Students take it, proctored",
    text: "The webcam check runs in the browser while the student answers in fullscreen under a live timer.",
  },
  {
    n: "03",
    title: "Review what was flagged",
    text: "Examiners open one page with scores, risk levels and a timeline of every flagged moment.",
  },
];

const sample = [
  { name: "Aarav Sharma", label: "Clear", score: 4, bar: "bg-emerald", text: "text-emerald-400" },
  { name: "Priya Verma", label: "Needs review", score: 32, bar: "bg-amber", text: "text-amber-400" },
  { name: "Rohan Gupta", label: "High risk", score: 71, bar: "bg-rose", text: "text-rose-400" },
];

export const LandingPage: React.FC = () => {
  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative bg-grid">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet/30 blur-3xl" />
        <div className="pointer-events-none absolute top-40 right-0 h-72 w-72 rounded-full bg-cyan/15 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="glass-violet inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              AI proctoring that runs in the browser
            </span>

            <h1 className="mt-5 font-display text-4xl font-bold leading-tight text-slate-50 sm:text-5xl lg:text-6xl">
              Online exams you can <span className="text-gradient-multi">actually trust</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-slate-400">
              ExamShield AI watches every session in real time: face presence, gaze, tab switching,
              fullscreen. It gives examiners a clear risk score for every student, and the video
              never leaves the student's device.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-xl bg-violet px-6 py-3 font-medium text-white transition-all hover:bg-violet-400 hover:shadow-glow-violet"
              >
                Get started free
              </Link>
              <Link
                to="/login"
                className="glass rounded-xl px-6 py-3 font-medium text-slate-200 transition-colors hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </motion.div>

          {/* Sample examiner view */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="glass-strong rounded-2xl p-5 shadow-glass-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                <p className="text-sm font-medium text-slate-200">Examiner view</p>
              </div>
              <span className="text-xs text-slate-500">Sample data</span>
            </div>

            <div className="flex flex-col gap-3">
              {sample.map((s) => (
                <div key={s.name} className="glass flex items-center justify-between rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{s.name}</p>
                    <p className={`text-xs ${s.text}`}>{s.label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full ${s.bar}`} style={{ width: `${s.score}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-slate-400">{s.score}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="glass-rose mt-4 rounded-xl px-4 py-3 text-xs text-rose-300">
              🚨 Multiple faces detected, flagged as critical
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <motion.div {...fade} className="mb-12 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-50">Everything an exam needs</h2>
          <p className="mt-3 text-slate-400">Proctoring, grading and review in one place.</p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...fade}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="glass card-hover rounded-2xl p-6"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet/15 text-xl">
                {f.icon}
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <motion.div {...fade} className="mb-12 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-50">How it works</h2>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              {...fade}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass rounded-2xl p-6"
            >
              <p className="text-gradient-cyan font-display text-3xl font-bold">{s.n}</p>
              <h3 className="mt-3 font-display text-lg font-semibold text-slate-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <motion.div {...fade} className="glass-violet rounded-3xl px-8 py-12 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-50">Ready to run your first proctored exam?</h2>
          <p className="mt-3 text-slate-400">Create an account and set one up in a few minutes.</p>
          <Link
            to="/register"
            className="mt-6 inline-block rounded-xl bg-violet px-6 py-3 font-medium text-white transition-all hover:bg-violet-400 hover:shadow-glow-violet"
          >
            Create your account
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        ExamShield AI · AI-powered exam proctoring
      </footer>
    </div>
  );
};