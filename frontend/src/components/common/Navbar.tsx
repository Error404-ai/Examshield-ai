/**
 * Navbar Component
 * Flat top bar: wordmark, text links with an underline on the active one,
 * and the signed-in user on the right.
 */

import React from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { User, UserRole } from "../../types";

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
    { label: "Integrity", to: "/admin/integrity" },
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
    <nav className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-10">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight text-gray-900">
            ExamShield
          </Link>

          {user && (
            <div className="flex h-14 items-stretch gap-6">
              {links.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center text-sm font-medium transition-colors ${
                      active ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {link.label}
                    {active && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-5">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs capitalize text-gray-500">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
