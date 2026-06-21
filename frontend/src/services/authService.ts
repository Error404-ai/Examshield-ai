/**
 * Auth Service
 * Login, register, logout, token management
 */

import api from "./api";
import { AuthResponse, LoginRequest, RegisterRequest, User } from "../types";

export const authService = {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login", credentials);
    this._storeTokens(data.access_token, data.refresh_token);
    return data;
  },

  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/register", payload);
    this._storeTokens(data.access_token, data.refresh_token);
    return data;
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<{ success: boolean; user: User }>("/auth/me");
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      this._clearTokens();
    }
  },

  _storeTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
  },

  _clearTokens(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem("access_token");
  },
};