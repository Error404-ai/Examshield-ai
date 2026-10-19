/**
 * AlreadySignedIn
 * Shown on /login and /register when a session already exists, instead of
 * force-redirecting. The user can continue or sign out and switch accounts.
 */

import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../common/Button";
import { User, UserRole } from "../../types";

interface Props {
  user: User;
  onSignOut: () => void;
}

export const AlreadySignedIn: React.FC<Props> = ({ user, onSignOut }) => {
  const home = user.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard";

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-md">
      <div>
        <p className="text-sm text-gray-500">You&rsquo;re already signed in as</p>
        <p className="mt-1 font-display text-lg font-semibold text-gray-900">{user.name}</p>
        <p className="text-xs capitalize text-gray-500">
          {user.email} · {user.role}
        </p>
      </div>

      <Link to={home} className="block">
        <Button size="lg" className="w-full">
          Go to dashboard
        </Button>
      </Link>

      <button
        type="button"
        onClick={onSignOut}
        className="text-sm font-medium text-indigo-700 transition-colors hover:text-indigo-900"
      >
        Sign out and use a different account
      </button>
    </div>
  );
};
