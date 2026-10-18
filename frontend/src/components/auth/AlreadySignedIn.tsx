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
    <div className="glass-strong flex flex-col gap-5 rounded-2xl p-8 text-center shadow-glass-lg">
      <div>
        <p className="text-sm text-slate-400">You're already signed in as</p>
        <p className="mt-1 text-lg font-semibold text-slate-100">{user.name}</p>
        <p className="text-xs capitalize text-slate-500">
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
        className="text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
      >
        Sign out and use a different account
      </button>
    </div>
  );
};
