/**
 * Navbar Component
 */

import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { User, UserRole } from "../../types";
import { Button } from "./Button";

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Only link to pages that exist
  const adminLinks = [
    { label: "Dashboard", to: "/admin/dashboard" },
    { label: "Create Exam", to: "/admin/exams/new" },
  ];

  const studentLinks = [
    { label: "Dashboard", to: "/student/dashboard" },
    { label: "Results", to: "/student/results" },
  ];

  const links = user?.role === UserRole.ADMIN ? adminLinks : studentLinks;

  const handleLogout = async () => {
    await onLogout();
    navigate("/login");
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet to-cyan flex items-center justify-center shadow-glow-violet">
              <span className="text-white font-bold text-sm font-display">ES</span>
            </div>
            <span className="font-display font-semibold text-slate-100">
              ExamShield <span className="text-gradient-violet">AI</span>
            </span>
          </Link>

          {/* Nav Links */}
          {user && (
            <div className="flex items-center gap-1">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "bg-violet/15 text-violet-300"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-100">{user.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-xl bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 hover:shadow-glow-violet transition-all"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};