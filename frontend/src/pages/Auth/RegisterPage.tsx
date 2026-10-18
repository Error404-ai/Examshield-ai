/**
 * Register Page
 * New accounts are always students. Admin access is granted by the server
 * (ADMIN_EMAILS env var), never chosen by the user.
 */

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Badge";
import { AlreadySignedIn } from "../../components/auth/AlreadySignedIn";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";
import { getErrorMessage } from "../../utils";

export const RegisterPage: React.FC = () => {
  const { register, logout, user, isLoading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!form.name || !form.email || !form.password || !form.confirm_password) {
      setError("Please fill in all fields");
      return;
    }
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const created = await register({ ...form, role: UserRole.STUDENT });
      navigate(
        created.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard",
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
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan shadow-glow-violet">
              <span className="font-display text-xl font-bold text-white">ES</span>
            </div>
          </Link>
          <h1 className="font-display text-2xl font-bold text-slate-50">Create account</h1>
          <p className="mt-1 text-sm text-slate-400">Join ExamShield AI</p>
        </div>

        {isLoading ? null : user ? (
          <AlreadySignedIn user={user} onSignOut={logout} />
        ) : (
          <div className="glass-strong flex flex-col gap-5 rounded-2xl p-8 shadow-glass-lg">
            {error && <Alert variant="error">{error}</Alert>}

            <Input
              label="Full Name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Repeat password"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />

            <Button onClick={handleSubmit} loading={loading} size="lg" className="mt-1 w-full">
              Create Account
            </Button>

            <p className="text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-violet-400 hover:text-violet-300">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
