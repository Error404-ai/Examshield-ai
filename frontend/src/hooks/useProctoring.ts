/**
 * useProctoring Hook
 * Webcam + in-browser face analysis (MediaPipe Face Landmarker),
 * tab-switch and fullscreen tracking. Only small events go to the server;
 * video frames never leave the browser.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { AlertSeverity, BehaviorAlert } from "../types";
import { proctoringService, ProctorEventType } from "../services/proctoringService";

export type FaceStatus =
  | "idle"
  | "ok"
  | "no_face"
  | "multiple_faces"
  | "looking_away"
  | "eyes_closed";

export type ModelState = "idle" | "loading" | "ready" | "error";

const MEDIAPIPE_VERSION = "0.10.14"; // keep in sync with package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const SAMPLE_MS = 500;

interface Rule {
  type: ProctorEventType;
  samples: number; // consecutive samples before it counts (samples * 500ms)
  cooldownMs: number; // min gap between two events of this type
  severity: AlertSeverity;
  description: string;
}

const RULES: Record<Exclude<FaceStatus, "idle" | "ok">, Rule> = {
  no_face: {
    type: "face_not_detected",
    samples: 6,
    cooldownMs: 20000,
    severity: AlertSeverity.HIGH,
    description: "No face visible in the camera",
  },
  multiple_faces: {
    type: "multiple_faces",
    samples: 3,
    cooldownMs: 20000,
    severity: AlertSeverity.CRITICAL,
    description: "More than one person detected in the camera",
  },
  looking_away: {
    type: "looking_away",
    samples: 6,
    cooldownMs: 20000,
    severity: AlertSeverity.MEDIUM,
    description: "Student looking away from the screen",
  },
  eyes_closed: {
    type: "eyes_closed",
    samples: 8,
    cooldownMs: 30000,
    severity: AlertSeverity.LOW,
    description: "Eyes closed for an extended time",
  },
};

function classify(res: FaceLandmarkerResult): FaceStatus {
  const faces = res.faceLandmarks.length;
  if (faces === 0) return "no_face";
  if (faces > 1) return "multiple_faces";

  const lm = res.faceLandmarks[0];
  const nose = lm[1];
  const leftCheek = lm[234];
  const rightCheek = lm[454];
  const width = rightCheek.x - leftCheek.x;
  const yaw = width > 0.0001 ? (nose.x - leftCheek.x) / width : 0.5;

  // Head turned clearly to one side
  if (yaw < 0.3 || yaw > 0.7) return "looking_away";

  const shapes = res.faceBlendshapes?.[0]?.categories ?? [];
  const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;

  const blink = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
  if (blink > 0.6) return "eyes_closed";

  // Eyes pointing sideways while the head faces the screen
  const sideA = (score("eyeLookOutLeft") + score("eyeLookInRight")) / 2;
  const sideB = (score("eyeLookInLeft") + score("eyeLookOutRight")) / 2;
  if (Math.max(sideA, sideB) > 0.65) return "looking_away";

  return "ok";
}

export interface ProctoringHook {
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  cameraReady: boolean;
  cameraError: string;
  modelState: ModelState;
  faceStatus: FaceStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
}

export function useProctoring(sessionId: string): ProctoringHook {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const wasFullscreenRef = useRef(false);
  const streakRef = useRef<{ status: FaceStatus; count: number }>({ status: "ok", count: 0 });
  const lastSentRef = useRef<Record<string, number>>({});

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("idle");
  const [alerts, setAlerts] = useState<BehaviorAlert[]>([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  // Record an event locally and send it to the server (fire and forget)
  const emit = useCallback(
    (type: ProctorEventType, severity: AlertSeverity, description: string, cooldownMs = 0) => {
      const now = Date.now();
      const last = lastSentRef.current[type] ?? 0;
      if (now - last < cooldownMs) return;
      lastSentRef.current[type] = now;

      const alert: BehaviorAlert = {
        session_id: sessionId,
        alert_type: type,
        severity,
        description,
        timestamp: new Date().toISOString(),
      };
      setAlerts((prev) => [...prev.slice(-49), alert]);
      proctoringService.logEvent(sessionId, { alert_type: type, severity, description }).catch(() => {});
    },
    [sessionId]
  );

  // One analysis pass over the current video frame
  const tick = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) return;

    let status: FaceStatus;
    try {
      status = classify(landmarker.detectForVideo(video, performance.now()));
    } catch {
      return;
    }

    setFaceStatus((prev) => (prev === status ? prev : status));

    const streak = streakRef.current;
    if (streak.status === status) streak.count += 1;
    else {
      streak.status = status;
      streak.count = 1;
    }
    if (status === "ok" || status === "idle") return;

    const rule = RULES[status];
    if (streak.count >= rule.samples) {
      emit(rule.type, rule.severity, rule.description, rule.cooldownMs);
    }
  }, [emit]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setCameraReady(false);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setCameraError("");

    // 1) Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (!runningRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        emit("camera_blocked", AlertSeverity.HIGH, "Camera was turned off or disconnected");
        setCameraError("Your camera was disconnected. Reconnect it to continue.");
        setCameraReady(false);
        runningRef.current = false;
      });

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      runningRef.current = false;
      setCameraError("Camera access is required for this exam. Allow the camera and try again.");
      emit("camera_blocked", AlertSeverity.HIGH, "Camera access denied or unavailable");
      return;
    }

    // 2) Face model (downloaded once, then cached by the browser)
    setModelState("loading");
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

      const create = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
        });

      let landmarker: FaceLandmarker;
      try {
        landmarker = await create("GPU");
      } catch {
        landmarker = await create("CPU");
      }

      if (!runningRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      setModelState("ready");
      timerRef.current = setInterval(tick, SAMPLE_MS);
    } catch (err) {
      console.error("[ExamShield] Face model failed to load", err);
      setModelState("error");
    }
  }, [emit, tick]);

  // Tab switches
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      setTabSwitchCount((n) => n + 1);
      emit("tab_switch", AlertSeverity.MEDIUM, "Student left the exam tab");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [emit]);

  // Leaving fullscreen
  useEffect(() => {
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        wasFullscreenRef.current = true;
      } else if (wasFullscreenRef.current) {
        wasFullscreenRef.current = false;
        emit("fullscreen_exit", AlertSeverity.MEDIUM, "Student exited fullscreen mode");
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, [emit]);

  // Block right-click and common shortcuts during the exam
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    const blockShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "p", "s", "u"].includes(e.key.toLowerCase())) {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wasFullscreenRef.current = false;
      stop();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [stop]);

  return {
    videoRef,
    start,
    stop,
    cameraReady,
    cameraError,
    modelState,
    faceStatus,
    alerts,
    tabSwitchCount,
  };
}