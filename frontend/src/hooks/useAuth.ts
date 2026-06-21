/**
 * useAuth Hook
 * Global auth state with localStorage persistence
 */

import { useState, useEffect, useCallback } from "react";
import { User, UserRole, LoginRequest, RegisterRequest } from "../types";
import { authService } from "../services/authService";

interface AuthHookState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isStudent: boolean;
}

export function useAuth(): AuthHookState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      if (!authService.isAuthenticated()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authService.getMe();
        setUser(me);
      } catch {
        authService["_clearTokens"]();
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    const res = await authService.login(credentials);
    setUser(res.user);
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const res = await authService.register(payload);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    isAdmin: user?.role === UserRole.ADMIN,
    isStudent: user?.role === UserRole.STUDENT,
  };
}