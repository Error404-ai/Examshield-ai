/**
 * useProctoring Hook
 * Manages webcam access, tab-switch detection, and WS proctoring feed
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { BehaviorAlert } from "../types";
import { ProctoringSocket, proctoringService } from "../services/proctoringService";

interface ProctoringHookState {
  isConnected: boolean;
  alerts: BehaviorAlert[];
  tabSwitchCount: number;
  sessionTerminated: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useProctoring(sessionId: string, onTerminate: () => void): ProctoringHookState {
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState<BehaviorAlert[]>([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [sessionTerminated, setSessionTerminated] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<ProctoringSocket | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAlerts = useCallback((newAlerts: BehaviorAlert[]) => {
    setAlerts((prev) => [...prev, ...newAlerts]);
  }, []);

  const handleTermination = useCallback(() => {
    setSessionTerminated(true);
    onTerminate();
  }, [onTerminate]);

  // Connect WebSocket
  useEffect(() => {
    const socket = new ProctoringSocket(sessionId, handleAlerts, handleTermination);
    socket.connect();
    socketRef.current = socket;
    setIsConnected(true);

    return () => {
      socket.disconnect();
      setIsConnected(false);
    };
  }, [sessionId, handleAlerts, handleTermination]);

  // Tab visibility detection
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const result = await proctoringService.logTabSwitch(sessionId);
        setTabSwitchCount(result.tab_switch_count);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionId]);

  // Disable right-click and keyboard shortcuts during exam
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

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Send frame analysis every 3 seconds
      frameIntervalRef.current = setInterval(() => {
        socketRef.current?.sendFrameAnalysis({
          type: "frame_analysis",
          face_detected: true,       // Replace with actual ML result
          looking_at_screen: true,   // Replace with actual gaze result
          tab_active: !document.hidden,
        });
      }, 3000);
    } catch (err) {
      console.error("[ExamShield] Camera access denied:", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return {
    isConnected,
    alerts,
    tabSwitchCount,
    sessionTerminated,
    videoRef,
    startCamera,
    stopCamera,
  };
}