![Kindred AI Studio](kindredaistudio.png)

# Kindred AI Studio

A full-stack webapp that lets users build applications via natural-language vibe coding. Uses intelligent AI model routing between Gemini 2.5 Pro, GPT-5.4, and a Hermes reasoning agent. Code executes in secure E2B cloud sandboxes with live previews.

## 🚀 What's New (v2.0)

- **Zero-Dependency Architecture:** Completely migrated from Redis to an integrated SQLite architecture (WAL mode) for caching, rate limiting, and job queuing.
- **Monetization & Quotas:** Usage-based billing with tiered limits (Free/Pro/Team) enforced across token usage and sandbox deployments.
- **PayPal Integration:** Fully integrated end-to-end PayPal checkout for upgrading user pricing tiers instantly.
- **Template Marketplace:** A beautiful new Template Picker UI allowing users to jump-start projects via built-in framework scaffolds (React SPA, Express API, etc.).
- **Production VM Deployment:** Simplified one-click VM deployment with a new `deploy.sh` script, securing the stack behind an Nginx reverse proxy.

## ✨ Core Features

- **Multi-Model Intelligence:** Intelligent automatic routing between Gemini 2.5 Pro (speed), GPT-5.4 (complex generation), and a Hermes agent (deep reasoning).
- **Live Cloud Sandboxes:** Instant code execution and live previews via E2B Code Interpreter.
- **Modern Interface:** Highly polished Next.js React frontend featuring fluid animations, Monaco editor, and a dynamic usage dashboard.
- **Secure Authentication:** Built-in Clerk Auth for seamless sign-in and session management.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Clerk Auth, Monaco Editor |
| Backend | Node.js, Express, TypeScript, Google Generative AI, OpenAI, E2B SDK, BullMQ |
| Worker | Python 3.13, FastAPI, OpenAI (Hermes mock) |
| Database | PostgreSQL 16 (user auth, MCP metadata) |
| Cache/Queue | SQLite (WAL mode) |
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

### 2. Start Infrastructure (PostgreSQL)

```bash
docker compose up postgres -d
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

### Production VM Deployment

For a production deployment inside a Virtual Machine, a helper script is provided which will install Docker, generate security keys, and start the full stack behind an Nginx reverse proxy.

```bash
chmod +x deploy.sh
./deploy.sh
```

## Architecture

```
            [ Public Internet ]
                   |
            Nginx (Port 80)
             /           \
     ( / )  /             \ ( /api/* )
           v               v
Frontend (internal)  -->  Backend (internal)  -->  Hermes Worker (internal)
     |                        |                           |
  Clerk Auth                  |                        OpenAI API
                              |
                     PostgreSQL & SQLite
                              |
                     E2B Sandbox (cloud)
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
- `PAYPAL_CLIENT_ID` — PayPal integration
## Development

```bash
# Backend type-check
cd backend && npx tsc --noEmit

# Frontend build
cd frontend && npx next build

# Hermes worker
cd service && uvicorn main:app --reload
```
