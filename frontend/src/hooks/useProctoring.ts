/**
 * useProctoring Hook
 * Webcam + in-browser analysis (MediaPipe Face Landmarker + Object Detector),
 * tab-switch and fullscreen tracking. Only small events go to the server;
 * video frames never leave the browser.
 *
 * Fullscreen: browsers only allow requestFullscreen() from a user click, so the
 * exam page must call enterFullscreen() from its "Start exam" button, and show
 * a "Return to fullscreen" overlay (also a click) whenever isFullscreen is false.
 *
 * Phone detection: an object detector looks for a "cell phone" about once a
 * second. It is a hint for the reviewer, not proof, so a phone has to be seen
 * in consecutive checks before an alert is raised.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  FaceLandmarker,
  FaceLandmarkerResult,
  ObjectDetector,
} from "@mediapipe/tasks-vision";
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
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const OBJECT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

const SAMPLE_MS = 500;

// Cooldowns (ms) for events that don't come from the face rules below
const CAMERA_COOLDOWN = 30000;
const TAB_COOLDOWN = 2000; // some browsers fire visibilitychange twice on one switch
const FULLSCREEN_COOLDOWN = 3000;

// Phone detection
const PHONE_EVERY_N_TICKS = 2; // 2 x 500ms = one check per second
const PHONE_SAMPLES = 2; // consecutive positive checks before an alert
const PHONE_COOLDOWN = 30000;
const PHONE_SCORE = 0.35; // detector confidence threshold

// Add "phone_detected" to the ProctorEventType union in proctoringService.ts,
// then this double cast can be replaced with a plain string.
const PHONE_EVENT = "phone_detected" as unknown as ProctorEventType;

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
  phoneDetectorState: ModelState;
  faceStatus: FaceStatus;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  enterFullscreen: () => Promise<boolean>;
}

export function useProctoring(sessionId: string): ProctoringHook {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const detectorRef = useRef<ObjectDetector | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const generationRef = useRef(0); // bumped by every stop(); stale start() calls bail out
  const endedCleanupRef = useRef<(() => void) | null>(null);
  const wasFullscreenRef = useRef(false);
  const tickCountRef = useRef(0);
  const phoneStreakRef = useRef(0);
  const streakRef = useRef<{ status: FaceStatus; count: number }>({ status: "ok", count: 0 });
  const lastSentRef = useRef<Record<string, number>>({});

  const fullscreenSupported =
    typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [phoneDetectorState, setPhoneDetectorState] = useState<ModelState>("idle");
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("idle");
  const [alerts, setAlerts] = useState<BehaviorAlert[]>([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" && !!document.fullscreenElement
  );

  // Record an event locally and send it to the server (fire and forget).
  // The cooldown is checked per event type, so repeats inside the window are dropped.
  const emit = useCallback(
    (type: ProctorEventType, severity: AlertSeverity, description: string, cooldownMs = 0) => {
      const now = Date.now();
      const last = lastSentRef.current[type] ?? 0;
      if (now - last < cooldownMs) return false;
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
      return true;
    },
    [sessionId]
  );

  // Must be called from a click handler (browsers block it otherwise).
  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (!document.documentElement.requestFullscreen) return false;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Look for a phone in the current frame
  const checkPhone = useCallback(
    (video: HTMLVideoElement) => {
      const detector = detectorRef.current;
      if (!detector) return;

      let found = false;
      try {
        const res = detector.detectForVideo(video, performance.now());
        found = res.detections.some((d) =>
          d.categories.some((c) => c.categoryName === "cell phone")
        );
      } catch {
        return;
      }

      phoneStreakRef.current = found ? phoneStreakRef.current + 1 : 0;
      if (phoneStreakRef.current >= PHONE_SAMPLES) {
        emit(
          PHONE_EVENT,
          AlertSeverity.HIGH,
          "Mobile phone detected in the camera",
          PHONE_COOLDOWN
        );
      }
    },
    [emit]
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

    tickCountRef.current += 1;
    if (tickCountRef.current % PHONE_EVERY_N_TICKS === 0) checkPhone(video);

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
  }, [emit, checkPhone]);

  const stop = useCallback(() => {
    generationRef.current += 1; // invalidates any start() still awaiting something
    runningRef.current = false;
    endedCleanupRef.current?.(); // remove the "ended" listener before stopping tracks
    endedCleanupRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    phoneStreakRef.current = 0;
    tickCountRef.current = 0;
    setCameraReady(false);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setCameraError("");
    const gen = generationRef.current;
    const isStale = () => gen !== generationRef.current;

    // 1) Camera
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch {
      if (isStale()) return; // a newer start() or stop() owns the state now
      runningRef.current = false;
      setCameraError("Camera access is required for this exam. Allow the camera and try again.");
      emit("camera_blocked", AlertSeverity.HIGH, "Camera access denied or unavailable", CAMERA_COOLDOWN);
      return;
    }

    if (isStale()) {
      // stop() ran while the permission prompt was open: release this stream
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;

    const track = stream.getVideoTracks()[0];
    if (track) {
      const onEnded = () => {
        if (isStale() || streamRef.current !== stream) return;
        emit("camera_blocked", AlertSeverity.HIGH, "Camera was turned off or disconnected", CAMERA_COOLDOWN);
        setCameraError("Your camera was disconnected. Reconnect it to continue.");
        setCameraReady(false);
        setFaceStatus("idle");
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        runningRef.current = false; // lets start() be called again after reconnecting
      };
      track.addEventListener("ended", onEnded);
      endedCleanupRef.current = () => track.removeEventListener("ended", onEnded);
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    if (isStale()) return;
    setCameraReady(true);

    // 2) Models (downloaded once, then cached by the browser)
    setModelState("loading");
    setPhoneDetectorState("loading");

    let vision: typeof import("@mediapipe/tasks-vision");
    let fileset: Awaited<ReturnType<(typeof import("@mediapipe/tasks-vision"))["FilesetResolver"]["forVisionTasks"]>>;
    try {
      vision = await import("@mediapipe/tasks-vision");
      fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    } catch (err) {
      if (isStale()) return;
      console.error("[ExamShield] MediaPipe failed to load", err);
      setModelState("error");
      setPhoneDetectorState("error");
      return;
    }

    // 2a) Face model
    try {
      const create = (delegate: "GPU" | "CPU") =>
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
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

      if (isStale()) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      setModelState("ready");
      timerRef.current = setInterval(tick, SAMPLE_MS);
    } catch (err) {
      if (isStale()) return;
      console.error("[ExamShield] Face model failed to load", err);
      setModelState("error");
    }

    // 2b) Phone detector. If it fails, face monitoring keeps working without it.
    try {
      const createDetector = (delegate: "GPU" | "CPU") =>
        vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate },
          runningMode: "VIDEO",
          scoreThreshold: PHONE_SCORE,
          categoryAllowlist: ["cell phone"],
          maxResults: 3,
        });

      let detector: ObjectDetector;
      try {
        detector = await createDetector("GPU");
      } catch {
        detector = await createDetector("CPU");
      }

      if (isStale()) {
        detector.close();
        return;
      }
      detectorRef.current = detector;
      setPhoneDetectorState("ready");
    } catch (err) {
      if (isStale()) return;
      console.error("[ExamShield] Phone detector failed to load", err);
      setPhoneDetectorState("error");
    }
  }, [emit, tick]);

  // Tab switches
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      // count only events that pass the cooldown, so the counter matches the alerts
      const sent = emit("tab_switch", AlertSeverity.MEDIUM, "Student left the exam tab", TAB_COOLDOWN);
      if (sent) setTabSwitchCount((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [emit]);

  // Fullscreen: track state, log exits
  useEffect(() => {
    const onFullscreen = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (active) {
        wasFullscreenRef.current = true;
      } else if (wasFullscreenRef.current) {
        wasFullscreenRef.current = false;
        emit("fullscreen_exit", AlertSeverity.MEDIUM, "Student exited fullscreen mode", FULLSCREEN_COOLDOWN);
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
      wasFullscreenRef.current = false; // leaving the page is not a violation
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
    phoneDetectorState,
    faceStatus,
    alerts,
    tabSwitchCount,
    fullscreenSupported,
    isFullscreen,
    enterFullscreen,
  };
}