import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../services/api";
import { User, RegisterRequest } from "../types";

interface Credentials {
  email: string;
  password: string;
}

interface AuthCtx {
  user: User | null;
  isLoading: boolean;
  login: (credentials: Credentials) => Promise<User>;
  register: (payload: RegisterRequest) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On page load, restore the session if a token exists
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    const res = await api.post("/auth/login", credentials);
    localStorage.setItem("token", res.data.access_token);
    setUser(res.data.user);
    return res.data.user as User;
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const res = await api.post("/auth/register", payload);
    localStorage.setItem("token", res.data.access_token);
    setUser(res.data.user);
    return res.data.user as User;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};