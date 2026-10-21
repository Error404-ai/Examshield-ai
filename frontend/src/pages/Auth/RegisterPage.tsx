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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
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
    <div className="flex min-h-dvh items-center justify-center px-4 py-6 sm:py-8">
      <div className="my-auto w-full max-w-md">
        <div className="mb-6 text-center sm:mb-7">
          <Link
            to="/"
            className="font-display text-xl font-semibold tracking-tight text-gray-900"
          >
            ExamShield
          </Link>
          <h1 className="mt-4 font-display text-3xl font-semibold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Join ExamShield AI as a student.</p>
        </div>

        {isLoading ? null : user ? (
          <AlreadySignedIn user={user} onSignOut={logout} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 rounded-lg border border-gray-200 bg-white p-6 shadow-md sm:gap-4 sm:p-8">
            {error && <Alert variant="error">{error}</Alert>}

            <Input
              label="Full name"
              placeholder="John Doe"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <Input
              label="Password"
              type="password"
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <Input
              label="Confirm password"
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              minLength={6}
              required
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
            />

            <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
              Create account
            </Button>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-indigo-700 underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
