/**
 * useProctoring Hook
 * Runs entirely in the browser:
 *  - webcam access
 *  - MediaPipe face detection (no face / multiple faces / head turned away)
 *  - tab-switch detection
 *  - blocks right-click and copy/paste shortcuts
 * Only small event records are sent to the server (no video).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { AlertSeverity, BehaviorAlert } from "../types";
import { proctoringService, ProctoringEventType } from "../services/proctoringService";

declare const require: (id: string) => any;

type FaceDetectorLike = {
  detectForVideo(video: HTMLVideoElement, time: number): { detections: any[] };
  close(): void;
};

type FaceDetectorCtorLike = {
  createFromOptions(fileset: any, options: any): Promise<FaceDetectorLike>;
};

type VisionTasksModule = {
  FaceDetector: FaceDetectorCtorLike;
  FilesetResolver: {
    forVisionTasks(url: string): Promise<any>;
  };
};

const mediaPipeVision = (() => {
  try {
    return require("@mediapipe/tasks-vision") as VisionTasksModule;
  } catch {
    return null;
  }
})();

const FaceDetector = (mediaPipeVision?.FaceDetector ?? null) as FaceDetectorCtorLike | null;
const FilesetResolver = (mediaPipeVision?.FilesetResolver ?? null) as VisionTasksModule["FilesetResolver"] | null;

// Pinned to the same version as the npm package
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const CHECK_EVERY_MS = 1000;   // run face detection once a second
const STRIKES_NEEDED = 3;      // problem must last 3 checks in a row before it is reported
const COOLDOWN_MS = 15000;     // don't repeat the same alert more than once per 15s
const TURN_RATIO = 0.55;       // how far the nose may sit from the eye midpoint (relative to eye distance)

export type MonitorStatus =
  | "idle"      // not started
  | "starting"  // asking for camera / loading the model
  | "active"    // camera + face detection running
  | "degraded"  // camera works but the AI model could not load (tab-switch tracking still on)
  | "denied";   // camera blocked or missing

// Mirrors the severity the server assigns
const EVENTS: Record<ProctoringEventType, { severity: AlertSeverity; description: string }> = {
  tab_switch: { severity: AlertSeverity.HIGH, description: "You left the exam tab" },
  no_face: { severity: AlertSeverity.HIGH, description: "No face detected in the camera" },
  multiple_faces: { severity: AlertSeverity.CRITICAL, description: "More than one person detected" },
  looking_away: { severity: AlertSeverity.MEDIUM, description: "Looking away from the screen" },
  camera_off: { severity: AlertSeverity.CRITICAL, description: "Camera was turned off" },
};

type VisionIssue = "no_face" | "multiple_faces" | "looking_away";

interface ProctoringHookState {
  status: MonitorStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  sessionTerminated: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
}

export function useProctoring(sessionId: string, onTerminate: () => void): ProctoringHookState {
  const [status, setStatus] = useState<MonitorStatus>("idle");
  const [alerts, setAlerts] = useState<BehaviorAlert[]>([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [sessionTerminated, setSessionTerminated] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef(0); // bumps on every start/stop so stale async work can bail out
  const strikesRef = useRef<Record<VisionIssue, number>>({ no_face: 0, multiple_faces: 0, looking_away: 0 });
  const lastSentRef = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const terminatedRef = useRef(false);

  const onTerminateRef = useRef(onTerminate);
  onTerminateRef.current = onTerminate;

  // ── Report one event: show it locally, then tell the server ───────────────
  const report = useCallback(
    async (type: ProctoringEventType) => {
      if (terminatedRef.current) return;

      const now = Date.now();
      if (type !== "tab_switch") {
        const last = lastSentRef.current[type] ?? 0;
        if (now - last < COOLDOWN_MS) return;
      }
      lastSentRef.current[type] = now;

      const meta = EVENTS[type];
      setAlerts((prev) => [
        ...prev,
        {
          session_id: sessionId,
          alert_type: type,
          severity: meta.severity,
          description: meta.description,
          timestamp: new Date().toISOString(),
        },
      ]);

      try {
        const res = await proctoringService.logEvent(sessionId, type);
        setTabSwitchCount(res.tab_switch_count);
        if (res.terminate && !terminatedRef.current) {
          terminatedRef.current = true;
          setSessionTerminated(true);
          onTerminateRef.current();
        }
      } catch {
        // Offline or session already ended - the local alert is still shown
      }
    },
    [sessionId]
  );

  // ── One face-detection check ──────────────────────────────────────────────
  const check = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) return;

    let faces;
    try {
      faces = detector.detectForVideo(video, performance.now()).detections;
    } catch {
      return;
    }

    let issue: VisionIssue | null = null;
    if (faces.length === 0) {
      issue = "no_face";
    } else if (faces.length > 1) {
      issue = "multiple_faces";
    } else {
      // BlazeFace keypoints: 0 = right eye, 1 = left eye, 2 = nose tip
      const kp = faces[0].keypoints;
      if (kp && kp.length >= 3) {
        const eyeDist = Math.abs(kp[0].x - kp[1].x);
        if (eyeDist > 0.001) {
          const eyeMidX = (kp[0].x + kp[1].x) / 2;
          const ratio = Math.abs(kp[2].x - eyeMidX) / eyeDist;
          if (ratio > TURN_RATIO) issue = "looking_away";
        }
      }
    }

    // A problem only counts if it lasts several checks in a row
    (Object.keys(strikesRef.current) as VisionIssue[]).forEach((t) => {
      if (t !== issue) strikesRef.current[t] = 0;
    });
    if (!issue) return;

    strikesRef.current[issue] += 1;
    if (strikesRef.current[issue] >= STRIKES_NEEDED) {
      strikesRef.current[issue] = 0;
      report(issue);
    }
  }, [report]);

  // ── Stop everything ───────────────────────────────────────────────────────
  const stopMonitoring = useCallback(() => {
    runIdRef.current += 1;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
  }, []);

  // ── Start camera + detector ───────────────────────────────────────────────
  const startMonitoring = useCallback(async () => {
    stopMonitoring();
    const runId = runIdRef.current;
    setStatus("starting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      console.error("[ExamShield] Camera access failed:", err);
      if (runId === runIdRef.current) setStatus("denied");
      return;
    }

    if (runId !== runIdRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        report("camera_off");
        setStatus("denied");
      };
    });

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay is allowed because the video is muted */
      }
    }

    // Load the face detector (model files come from a CDN)
    let detector: FaceDetectorLike | null = null;
    try {
      if (!FilesetResolver || !FaceDetector) {
        throw new Error("MediaPipe vision tasks are unavailable");
      }
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    } catch (err) {
      console.error("[ExamShield] Face detector failed to load:", err);
    }

    if (runId !== runIdRef.current) {
      detector?.close();
      return;
    }

    if (!detector) {
      setStatus("degraded");
      return;
    }

    detectorRef.current = detector;
    intervalRef.current = setInterval(check, CHECK_EVERY_MS);
    setStatus("active");
  }, [check, report, stopMonitoring]);

  // ── Tab-switch detection ──────────────────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) report("tab_switch");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [report]);

  // ── Block right-click and copy/paste shortcuts ────────────────────────────
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    const blockShortcuts = (e: KeyboardEvent) => {
      if (e.ctrlKey && ["c", "v", "a", "p"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcuts);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => stopMonitoring, [stopMonitoring]);

  return {
    status,
    alerts,
    tabSwitchCount,
    sessionTerminated,
    videoRef,
    startMonitoring,
    stopMonitoring,
  };
}