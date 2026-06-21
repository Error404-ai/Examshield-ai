/**
 * Register Page
 */

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Badge";
import { useAuth } from "../../hooks/useAuth";
import { UserRole } from "../../types";
import { getErrorMessage } from "../../utils";

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm_password: "",
    role: UserRole.STUDENT,
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
      await register(form);
      navigate(form.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">ES</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Join ExamShield AI</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col gap-5">
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
          />

          {/* Role selector */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Register as</label>
            <div className="grid grid-cols-2 gap-3">
              {[UserRole.STUDENT, UserRole.ADMIN].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm({ ...form, role })}
                  className={`py-2.5 rounded-lg border text-sm font-medium capitalize transition-colors ${
                    form.role === role
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleSubmit} loading={loading} size="lg" className="w-full mt-1">
            Create Account
          </Button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};