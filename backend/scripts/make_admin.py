"""
Promote or demote an ExamShield account from your own machine.

Run from the backend/ folder (it reads MONGODB_URI from backend/.env):

    python -m scripts.make_admin you@example.com            # make admin
    python -m scripts.make_admin you@example.com --revoke   # back to student
    python -m scripts.make_admin --list                     # show current admins

The user must have registered first. Role changes take effect at their next
login, because the role is stored inside the login token (valid for 24 hours).
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

DEFAULT_DB = "examshield_db"  # same as DATABASE_NAME in app/core/config.py


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote or demote an ExamShield account")
    parser.add_argument("email", nargs="?", help="email the account registered with")
    parser.add_argument("--revoke", action="store_true", help="set the role back to student")
    parser.add_argument("--list", action="store_true", help="list all admin accounts")
    args = parser.parse_args()

    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is not set. Put it in backend/.env first.")
        return 1

    client = MongoClient(uri, tls=True, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=8000)
    users = client[os.getenv("DATABASE_NAME", DEFAULT_DB)].users

    if args.list:
        admins = list(users.find({"role": "admin"}, {"name": 1, "email": 1}))
        if not admins:
            print("No admin accounts.")
        for a in admins:
            print(f"{a['email']}  ({a.get('name', '')})")
        return 0

    if not args.email:
        parser.error("email is required unless you pass --list")

    email = args.email.strip().lower()
    role = "student" if args.revoke else "admin"
    result = users.update_one(
        {"email": email},
        {"$set": {"role": role, "updated_at": datetime.now(timezone.utc)}},
    )

    if result.matched_count == 0:
        print(f"No account with email {email}. Register it in the app first.")
        return 1

    print(f"{email} is now {role}. They need to sign out and back in.")
    return 0


if __name__ == "__main__":
    sys.exit(main())