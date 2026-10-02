/**
 * useExamTimer Hook
 * Countdown based on a wall-clock deadline (not tick counting), so background
 * tab throttling can't make it drift. onExpire fires exactly once.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface ExamTimerHook {
  timeLeft: number;        // seconds remaining
  isExpired: boolean;
  formattedTime: string;   // "MM:SS"
  stop: () => void;
}

export function useExamTimer(totalSeconds: number, onExpire: () => void): ExamTimerHook {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [isExpired, setIsExpired] = useState(false);
  const onExpireRef = useRef(onExpire);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always call the latest callback (it closes over the latest answers)
  onExpireRef.current = onExpire;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useEffect(() => {
    const deadline = Date.now() + totalSeconds * 1000;
    let fired = false;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && !fired) {
        fired = true;
        setIsExpired(true);
        stop();
        onExpireRef.current();
      }
    };

    intervalRef.current = setInterval(tick, 500);
    tick();
    return stop;
  }, [totalSeconds, stop]);

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");

  return { timeLeft, isExpired, formattedTime: `${minutes}:${seconds}`, stop };
}