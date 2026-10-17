/**
 * Login Page
 */

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Badge";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";
import { getErrorMessage } from "../../utils";

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate(user.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard", {
        replace: true,
      });
    }
  }, [user, navigate]);

  const handleSubmit = async () => {
    setError("");
    if (!form.email || !form.password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const loggedInUser = await login(form);
      navigate(
        loggedInUser.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard",
        { replace: true }
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-grid p-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-violet/25 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan shadow-glow-violet">
              <span className="font-display text-xl font-bold text-white">ES</span>
            </div>
          </Link>
          <h1 className="font-display text-2xl font-bold text-slate-50">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to ExamShield AI</p>
        </div>

        {/* Card */}
        <div className="glass-strong flex flex-col gap-5 rounded-2xl p-8 shadow-glass-lg">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          <Button onClick={handleSubmit} loading={loading} size="lg" className="mt-1 w-full">
            Sign In
          </Button>

          <p className="text-center text-sm text-slate-400">
            Don't have an account?{" "}
            <Link to="/register" className="font-medium text-violet-400 hover:text-violet-300">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};