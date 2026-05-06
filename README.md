

# Vibe Coding Webapp

A full-stack webapp that lets users build applications via natural-language vibe coding. Uses intelligent AI model routing between Gemini 2.5 Pro, GPT-5.4, and a Hermes reasoning agent. Code executes in secure E2B cloud sandboxes with live previews.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Clerk Auth, Monaco Editor |
| Backend | Node.js, Express, TypeScript, Google Generative AI, OpenAI, E2B SDK, BullMQ |
| Worker | Python 3.13, FastAPI, OpenAI (Hermes mock) |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + BullMQ |
| Sandboxes | E2B Code Interpreter |

## Prerequisites

- Node.js 20+
- Python 3.13+
- Docker & Docker Compose
- API keys for: Clerk, Google Gemini, OpenAI, E2B

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
# Edit .env and fill in your API keys
```

### 2. Start Infrastructure (PostgreSQL + Redis)

```bash
docker compose up postgres redis -d
```

### 3. Start Backend

```bash
cd backend
npm install
npm run dev
```

### 4. Start Frontend

```bash
cd frontend
npm install
# Copy your Clerk keys to frontend/.env.local
npm run dev
```

### 5. Start Hermes Worker

```bash
cd service
pip install -r requirements.txt
python main.py
```

### Full Docker Setup

```bash
docker compose up --build
```

## Architecture

```
Frontend (localhost:3000)  -->  Backend (localhost:3001)  -->  Hermes Worker (localhost:8000)
     |                              |                              |
     |                              |                              |
  Clerk Auth                   PostgreSQL + Redis              OpenAI API
     |                              |
     |                              |
  Monaco Editor             E2B Sandbox (cloud)
```

## API Endpoints

### Backend (port 3001)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/chat/send | Send message, get AI response |
| GET | /api/chat/history/:sessionId | Get chat history |
| GET | /api/projects | List user projects |
| POST | /api/projects | Create project |
| PATCH | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| POST | /api/sandbox/create | Create E2B sandbox |
| POST | /api/sandbox/execute | Execute code in sandbox |
| POST | /api/sandbox/command | Run terminal command |
| DELETE | /api/sandbox/:id | Destroy sandbox |

### Hermes Worker (port 8000)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /reason | Deep reasoning (sync) |
| POST | /reason/stream | Deep reasoning (streaming) |

## Model Routing

The backend intelligently routes requests:

- **Gemini 2.5 Pro** — Quick tasks, Q&A, small edits (fast + cost-effective)
- **GPT-5.4** — Complex code generation, refactoring, full implementations
- **Hermes** — Deep reasoning, architecture analysis, trade-off comparisons

Users can override routing via the model selector in the chat UI.

## Environment Variables

See `.env.example` for all required configuration. Key variables:

- `CLERK_SECRET_KEY` — Clerk backend secret
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk frontend key
- `GOOGLE_GEMINI_API_KEY` — Gemini API access
- `OPENAI_API_KEY` — OpenAI API access
- `E2B_API_KEY` — E2B sandbox provisioning
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string

## Development

```bash
# Backend type-check
cd backend && npx tsc --noEmit

# Frontend build
cd frontend && npx next build

# Hermes worker
cd service && uvicorn main:app --reload
```
