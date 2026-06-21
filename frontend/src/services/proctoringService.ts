/**
 * Proctoring Service
 * WebSocket connection, alert logging, tab-switch tracking
 */

import api from "./api";
import { BehaviorAlert, ProctoringReport, FrameAnalysisPayload } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/api/proctoring/ws";

// ============ WebSocket Manager ============

export class ProctoringSocket {
  private socket: WebSocket | null = null;
  private sessionId: string;
  private onAlert: (alerts: BehaviorAlert[]) => void;
  private onSessionTerminated: () => void;
  private reconnectAttempts = 0;
  private maxReconnects = 3;

  constructor(
    sessionId: string,
    onAlert: (alerts: BehaviorAlert[]) => void,
    onSessionTerminated: () => void
  ) {
    this.sessionId = sessionId;
    this.onAlert = onAlert;
    this.onSessionTerminated = onSessionTerminated;
  }

  connect(): void {
    const token = localStorage.getItem("access_token");
    this.socket = new WebSocket(`${WS_URL}/${this.sessionId}?token=${token}`);

    this.socket.onopen = () => {
      console.log("[ExamShield] Proctoring socket connected");
      this.reconnectAttempts = 0;
      this._startPing();
    };

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "proctoring_response" && payload.alerts?.length > 0) {
          this.onAlert(payload.alerts);
        }
        if (payload.session_terminated) {
          this.onSessionTerminated();
        }
      } catch (err) {
        console.error("[ExamShield] Failed to parse WS message", err);
      }
    };

    this.socket.onerror = () => {
      console.error("[ExamShield] Proctoring socket error");
    };

    this.socket.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
      }
    };
  }

  sendFrameAnalysis(payload: FrameAnalysisPayload): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private _startPing(): void {
    setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }
}

// ============ REST Proctoring API ============

export const proctoringService = {
  async logTabSwitch(sessionId: string): Promise<{
    tab_switch_count: number;
    warning: string | null;
  }> {
    const { data } = await api.post(`/proctoring/tab-switch?session_id=${sessionId}`);
    return data;
  },

  async logAlert(alert: BehaviorAlert): Promise<{ session_terminated?: boolean }> {
    const { data } = await api.post("/proctoring/alert", alert);
    return data;
  },

  async getReport(sessionId: string): Promise<ProctoringReport> {
    const { data } = await api.get(`/proctoring/report/${sessionId}`);
    return data.report;
  },

  async getAdminAlerts(): Promise<BehaviorAlert[]> {
    const { data } = await api.get("/proctoring/admin/alerts");
    return data.alerts;
  },
};