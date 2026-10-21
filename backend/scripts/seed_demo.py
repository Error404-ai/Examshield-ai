"""
Seed demo data for ExamShield AI (screenshots + live demo).

    cd backend
    python -m scripts.seed_demo --yes

Safe to re-run: it deletes the previous demo data first (users on
@demo.examshield.dev and everything they own), then recreates it.
Reads MONGODB_URI / DATABASE_NAME from your .env like the app does.
"""

import argparse
import math
import random
import re
from datetime import datetime, timedelta

import certifi
from bson import ObjectId
from pymongo import MongoClient

from app.core.config import settings
from app.core.security import SecurityUtils

DEMO_DOMAIN = "demo.examshield.dev"
PASSWORD = "Demo@1234"
ADMIN_EMAIL = f"admin@{DEMO_DOMAIN}"
STUDENT_EMAIL = f"student@{DEMO_DOMAIN}"

# (question, options, index of correct option, marks)
DS_QUESTIONS = [
    ("Which data structure uses LIFO order?", ["Queue", "Stack", "Heap", "Graph"], 1, 1),
    ("What is the worst-case time complexity of binary search?", ["O(n)", "O(log n)", "O(n log n)", "O(1)"], 1, 1),
    ("Which traversal of a BST yields sorted output?", ["Preorder", "Postorder", "Inorder", "Level order"], 2, 2),
    ("Which structure is typically used for BFS?", ["Stack", "Queue", "Heap", "Trie"], 1, 1),
    ("Average time to insert into a hash table with a good hash function?", ["O(1)", "O(n)", "O(log n)", "O(n^2)"], 0, 1),
    ("Which sort has O(n log n) worst case and is not in-place by default?", ["Quick sort", "Bubble sort", "Merge sort", "Insertion sort"], 2, 2),
    ("A complete binary tree with n nodes has height approximately:", ["n", "log2 n", "n/2", "sqrt n"], 1, 1),
    ("Which structure is best for implementing a priority queue?", ["Linked list", "Binary heap", "Stack", "Hash map"], 1, 1),
    ("Detecting a cycle in a linked list is commonly done with:", ["Floyd's two-pointer method", "Binary search", "Dijkstra's algorithm", "Kruskal's algorithm"], 0, 1),
    ("Which of these is NOT a linear data structure?", ["Array", "Queue", "Stack", "Tree"], 3, 1),
]
OS_QUESTIONS = [
    ("Which scheduling algorithm can starve long processes?", ["Round Robin", "Shortest Job First", "FCFS", "None of these"], 1, 1),
    ("Which is a necessary condition for deadlock?", ["Preemption", "Mutual exclusion", "Spooling", "Paging"], 1, 1),
    ("What does a TLB cache?", ["Page table entries", "Disk blocks", "CPU registers", "Interrupt vectors"], 0, 2),
    ("Which technique can cause external fragmentation?", ["Paging", "Segmentation", "Fixed partitioning", "Demand paging"], 1, 1),
    ("A process in the 'ready' state is waiting for:", ["I/O completion", "The CPU", "A semaphore", "Memory"], 1, 1),
    ("Which Unix system call creates a new process?", ["exec", "fork", "wait", "exit"], 1, 1),
]
DBMS_QUESTIONS = [
    ("Which normal form removes partial dependencies?", ["1NF", "2NF", "3NF", "BCNF"], 1, 1),
    ("Which SQL clause filters groups after aggregation?", ["WHERE", "GROUP BY", "HAVING", "ORDER BY"], 2, 1),
    ("In ACID, the 'I' stands for:", ["Integrity", "Isolation", "Indexing", "Idempotence"], 1, 1),
]

# name, accuracy on the exams, proctoring profile
STUDENTS = [
    ("Aarav Sharma", 0.90, "clean"),
    ("Diya Verma", 0.80, "clean"),
    ("Kabir Singh", 0.95, "suspicious"),
    ("Meera Nair", 0.60, "moderate"),
    ("Rohan Gupta", 0.40, "moderate"),
    ("Sneha Iyer", 0.70, "clean"),
]

ALERT_PROFILES = {
    "clean": [],
    "moderate": [
        ("looking_away", "low", "Student looked away from the screen"),
        ("tab_switch", "medium", "Tab switch detected"),
        ("looking_away", "low", "Student looked away from the screen"),
    ],
    "suspicious": [
        ("tab_switch", "medium", "Tab switch detected"),
        ("looking_away", "low", "Student looked away from the screen"),
        ("tab_switch", "medium", "Tab switch detected"),
        ("camera_blocked", "high", "Camera appears blocked or covered"),
        ("multiple_faces", "critical", "More than one face detected"),
        ("tab_switch", "high", "Repeated tab switching"),
    ],
}


def make_user(db, name, email, role, now):
    doc = {
        "name": name, "email": email,
        "password_hash": SecurityUtils.hash_password(PASSWORD),
        "role": role, "is_active": True, "created_at": now, "updated_at": now,
    }
    return str(db.users.insert_one(doc).inserted_id)


def make_exam(db, admin_id, title, description, duration, bank, published, now):
    total = sum(q[3] for q in bank)
    exam = {
        "title": title, "description": description, "duration": duration,
        "total_marks": total, "passing_marks": math.ceil(total * 0.4),
        "created_by": admin_id, "is_published": published,
        "created_at": now, "updated_at": now,
    }
    exam_id = str(db.exams.insert_one(exam).inserted_id)
    questions = [
        {
            "exam_id": exam_id, "question_text": text, "question_type": "mcq",
            "options": opts, "correct_answer": opts[correct], "marks": marks,
            "created_at": now + timedelta(milliseconds=i),
        }
        for i, (text, opts, correct, marks) in enumerate(bank)
    ]
    db.questions.insert_many(questions)  # adds _id to each dict
    return exam_id, exam, questions


def make_session(db, rng, exam_id, exam, questions, student_id, accuracy, profile, started):
    session_id = ObjectId()
    submitted = started + timedelta(minutes=rng.randint(exam["duration"] // 2, exam["duration"] - 2))

    graded, score = [], 0
    for q in questions:
        if rng.random() < accuracy:
            selected = q["correct_answer"]
        else:
            selected = rng.choice([o for o in q["options"] if o != q["correct_answer"]])
        correct = selected == q["correct_answer"]
        score += q["marks"] if correct else 0
        graded.append({
            "question_id": str(q["_id"]), "question_text": q["question_text"],
            "selected_answer": selected, "correct_answer": q["correct_answer"],
            "is_correct": correct, "marks": q["marks"],
            "marks_awarded": q["marks"] if correct else 0,
        })

    span = (submitted - started).total_seconds()
    alerts = []
    for i, (kind, severity, description) in enumerate(ALERT_PROFILES[profile]):
        offset = span * (i + 1) / (len(ALERT_PROFILES[profile]) + 1)
        alerts.append({
            "session_id": str(session_id), "alert_type": kind, "severity": severity,
            "description": description, "timestamp": started + timedelta(seconds=offset),
        })

    total = exam["total_marks"]
    db.sessions.insert_one({
        "_id": session_id, "student_id": student_id, "exam_id": exam_id,
        "status": "submitted", "started_at": started,
        "expires_at": started + timedelta(minutes=exam["duration"]),
        "submitted_at": submitted, "score": score, "total_marks": total,
        "percentage": round(score / total * 100, 2),
        "passed": score >= exam["passing_marks"],
        "answers": graded, "proctoring_alerts": alerts,
    })


def wipe_demo_data(db):
    users = list(db.users.find({"email": {"$regex": re.escape("@" + DEMO_DOMAIN) + "$"}}, {"_id": 1}))
    user_ids = [str(u["_id"]) for u in users]
    exam_ids = [str(e["_id"]) for e in db.exams.find({"created_by": {"$in": user_ids}}, {"_id": 1})]
    db.sessions.delete_many({"$or": [{"student_id": {"$in": user_ids}}, {"exam_id": {"$in": exam_ids}}]})
    db.questions.delete_many({"exam_id": {"$in": exam_ids}})
    db.exams.delete_many({"created_by": {"$in": user_ids}})
    db.users.delete_many({"_id": {"$in": [u["_id"] for u in users]}})


def main():
    parser = argparse.ArgumentParser(description="Seed ExamShield AI demo data")
    parser.add_argument("--yes", action="store_true", help="confirm writing to the configured database")
    args = parser.parse_args()
    if not args.yes:
        raise SystemExit(f"This writes demo data into database '{settings.DATABASE_NAME}'. Re-run with --yes.")

    client = MongoClient(settings.MONGODB_URI, tls=True, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=8000)
    db = client[settings.DATABASE_NAME]

    wipe_demo_data(db)
    rng = random.Random(42)  # fixed seed: same scores every run
    now = datetime.utcnow()

    admin_id = make_user(db, "Demo Admin", ADMIN_EMAIL, "admin", now)
    demo_student_id = make_user(db, "Demo Student", STUDENT_EMAIL, "student", now)
    students = [
        (make_user(db, name, f"{name.split()[0].lower()}@{DEMO_DOMAIN}", "student", now), acc, profile)
        for name, acc, profile in STUDENTS
    ]

    ds_id, ds, ds_q = make_exam(db, admin_id, "Data Structures Midterm",
                                "Arrays, stacks, queues, trees and hashing.", 30, DS_QUESTIONS, True, now)
    os_id, os_exam, os_q = make_exam(db, admin_id, "Operating Systems Quiz",
                                     "Scheduling, deadlocks and memory management.", 20, OS_QUESTIONS, True, now)
    make_exam(db, admin_id, "DBMS Draft", "Unpublished draft for the admin view.", 15, DBMS_QUESTIONS, False, now)

    for i, (sid, acc, profile) in enumerate(students):
        make_session(db, rng, ds_id, ds, ds_q, sid, acc, profile, now - timedelta(days=2, hours=i))
    for i, (sid, acc, _) in enumerate(students[:3]):
        make_session(db, rng, os_id, os_exam, os_q, sid, acc, "clean", now - timedelta(days=1, hours=i))
    # The demo student has one finished exam to show the results page;
    # Data Structures stays unattempted so it can be taken live.
    make_session(db, rng, os_id, os_exam, os_q, demo_student_id, 0.85, "clean", now - timedelta(hours=5))

    print(f"Seeded database '{settings.DATABASE_NAME}'")
    print(f"  Admin:   {ADMIN_EMAIL} / {PASSWORD}")
    print(f"  Student: {STUDENT_EMAIL} / {PASSWORD}")
    print("  Data Structures Midterm is unattempted for the demo student - take it live.")


if __name__ == "__main__":
    main()