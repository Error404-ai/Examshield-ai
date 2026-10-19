/**
 * Login Page
 * No forced redirect: if a session exists the user sees a choice
 * (continue to dashboard, or sign out and switch account).
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

export const LoginPage: React.FC = () => {
  const { login, logout, user, isLoading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="font-display text-xl font-semibold tracking-tight text-gray-900"
          >
            ExamShield
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to continue to your exams.</p>
        </div>

        {isLoading ? null : user ? (
          <AlreadySignedIn user={user} onSignOut={logout} />
        ) : (
          <div className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-8 shadow-md">
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
              Sign in
            </Button>

            <p className="text-center text-sm text-gray-500">
              Don&rsquo;t have an account?{" "}
              <Link to="/register" className="font-medium text-indigo-700 hover:text-indigo-900">
                Register
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
