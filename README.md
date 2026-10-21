# ExamShield AI

ExamShield AI is a full-stack exam management and proctoring application. The
backend is a FastAPI service backed by MongoDB; the frontend is a React,
TypeScript, and Vite single-page application.

## Requirements

- Python 3.10+
- Node.js 18+
- MongoDB for running the backend locally

## Local setup

### Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Create `backend/.env` and configure at least:

```dotenv
MONGODB_URI=mongodb://localhost:27017/examshield
JWT_SECRET_KEY=replace-with-a-random-secret-at-least-32-characters-long
DEBUG=true
```

Generate a strong JWT secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then start the API from the `backend` directory:

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`; interactive API docs are at
`http://localhost:8000/docs`. AI question generation additionally requires
`GEMINI_API_KEY`. To grant an account admin access, use
`python -m scripts.make_admin you@example.com` from `backend`.

### Frontend

In a second terminal, from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

The Vite development server runs at `http://localhost:5173` and proxies `/api`
requests to the local backend. For a deployed frontend, set `VITE_API_URL` to
the backend API base URL, including `/api`.

## Checks

Run the backend tests from `backend`:

```powershell
$env:DEBUG = "true"
python -m pytest
```

Run the frontend unit tests, type check, and production build from `frontend`:

```powershell
npm test
npm run typecheck
npm run build
```

## Deployment notes

- Set `MONGODB_URI` and a strong `JWT_SECRET_KEY` in the backend environment.
- Set `FRONTEND_URL` and, if needed, `EXTRA_CORS_ORIGINS` /
  `EXTRA_ALLOWED_HOSTS` to match the deployed frontend and backend hosts.
- Configure `GEMINI_API_KEY` only if AI question generation is needed.
- AI question generation is limited to 20 requests per admin per fixed
  one-hour window. Its MongoDB counter is shared by backend instances and
  expires through a TTL index.
