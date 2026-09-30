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
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">ES</span>
          </div>
          <span className="font-semibold text-gray-900">ExamShield AI</span>
        </Link>

        {/* Nav Links */}
        {user && (
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Right side */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      )}
    </nav>
  );
};