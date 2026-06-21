/**
 * useExamTimer Hook
 * Countdown timer for active exam sessions
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface ExamTimerHook {
  timeLeft: number;       // seconds remaining
  isExpired: boolean;
  formattedTime: string;  // "MM:SS"
  stop: () => void;
}

export function useExamTimer(durationMinutes: number, onExpire: () => void): ExamTimerHook {
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      stop();
      onExpire();
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          stop();
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");

  return {
    timeLeft,
    isExpired,
    formattedTime: `${minutes}:${seconds}`,
    stop,
  };
}