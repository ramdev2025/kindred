# Kindred AI Studio — Architecture

A full-stack vibe coding platform. Users describe apps in natural language; the system generates, deploys, and live-previews code inside secure E2B cloud sandboxes.

## Components

- **Frontend** — Next.js / React UI. Users type prompts, watch an inline agentic step trail (Thinking → Generating → Deploying → Fixing), and interact with a live iframe preview. Monaco editor lets them edit generated files and redeploy with one click. Clerk handles auth; logged-in users are redirected away from the landing page via middleware.

- **Backend (ADK Orchestrator)** — Node.js / Express. Verifies Clerk JWTs, routes requests to the correct AI model based on message intent and the active skill (Engineer / DevOps / Security), manages PostgreSQL + SQLite state, and orchestrates the E2B SDK.

- **Model Routing Layer** — Routes between Gemini 2.5 Pro and Claude Sonnet 4.6, both served through Vertex AI. Routing is intent-based: code generation → Gemini, reasoning/analysis → Claude, Security skill → always Claude.

- **Skill System** — Three expert personas (Engineer, DevOps, Security) each provide a distinct system prompt, preferred model, and agentic fix prompt. The active skill is stored per message in `chat_messages.metadata`.

- **Agentic Fix Loop** — After initial code generation, the backend deploys to E2B, detects errors, regenerates a fix using the skill-aware fix prompt, and redeploys — up to 3 iterations.

- **Deep Research Agent** — Python FastAPI service powered by Google ADK. Runs a `programmer_specialist` `LlmAgent` with `google_search` and a `ask_human` tool for human-in-the-loop clarification. Results stream back as SSE and render as a collapsible bubble inside the chat thread.

- **E2B Sandbox** — Ephemeral cloud micro-VMs. The backend writes files, installs dependencies (`npm install` / `pip install`), starts a dev server, polls for a live port, and returns a preview URL. Sandboxes reconnect across page refreshes and backend restarts via `Sandbox.connect()`. Preview URLs are persisted to `projects.preview_url` after first successful deploy.

- **Database** — PostgreSQL 16 stores users (synced from Clerk), projects (including `e2b_sandbox_id`, `preview_url`), chat sessions + messages (with `skill` in metadata), usage stats (with real cost estimates in `cost_cents`), deployments, and MCP connections. SQLite handles per-process caching, rate limiting, and token quota counters.

## Data Flow — Vibe Coding

```
User types prompt
       │
       ▼
Frontend page.tsx handleSend()
  ├─ Auto-creates E2B sandbox if none exists
  ├─ Adds AgentBubble (Thinking…) to message thread
  └─ POST /api/chat/agentic  (SSE)
           │
           ▼
     chat.ts — agentic route
       ├─ processChatStream()  →  Gemini / Claude (skill-routed)
       │     tokens stream back → AgentBubble transitions: Generating…
       ├─ runAgenticLoop()
       │     ├─ parseCodeFiles()  (filepath annotation or inferred filename)
       │     ├─ deployToSandbox()  →  E2B write + npm install + server start
       │     │     logs stream back → AgentBubble: Deploying…
       │     ├─ SUCCESS → previewUrl saved to DB, iframe loads
       │     └─ ERROR  → skill.fixPrompt() → regenerate → redeploy
       │           fix tokens stream back → new MessageBubble + AgentBubble: Fixing…
       └─ loop_complete → AgentBubble collapses to "Built · N steps"
```

## Data Flow — Deep Research (HITL)

```
User selects 🔍 Research Agent, types question
       │
       ▼
Frontend POST /api/research/start
       │
       ▼
Express research.ts proxy → Python /research/start
       │  returns session_id
       ▼
Frontend GET /api/research/:id/stream  (SSE)
       │
       ▼
ADK runner.run_async(programmer_specialist)
  ├─ google_search("query")
  │     → ResearchBubble emits: 🔍 search_query event
  │     → ResearchBubble emits: 📄 search_result event
  ├─ ask_human("clarifying question?")   ← HITL pause
  │     → ResearchBubble shows amber input box
  │     User answers → POST /api/research/:id/respond
  │     → asyncio.Queue feeds answer back to agent
  │     agent resumes
  └─ Final answer tokens stream
        → ResearchBubble renders markdown below the step trail
```

## Deployment (Docker Compose)

```
Nginx (80/443)
    ├── / → Frontend  (Next.js, port 3000)
    └── /api → Backend  (Express, port 3001)
                  └── internal → Research Agent  (FastAPI, port 8000)

PostgreSQL (port 5432, localhost-only)
```

All four services start with `docker compose up`. Schema + all migrations mount into Postgres's init directory and run in order on first boot.

## Key Design Decisions

- **Skill-aware fix prompts** — A DevOps fix prompt checks port bindings and Dockerfile syntax; a Security fix prompt checks for exposed secrets. Generic "fix the error" prompts produce worse results.
- **`Sandbox.connect()` reconnect** — E2B sandboxes survive backend restarts. On page load, the frontend checks `project.e2b_sandbox_id` and silently reconnects rather than requiring the user to restart.
- **Inline AgentBubble** — The agentic process trail is attached to each message and persisted in `agentSteps` state. Auto-collapses once the answer fills in, matching the UX pattern from Claude's tool-use display.
- **No Redis** — SQLite WAL handles caching, rate limiting, and quota counters at the scale of a single-node deployment. Swap to Redis/Upstash when horizontal scaling is needed.
