# Future Features & Completion Plan

This document outlines everything needed to evolve the Vibe Coding Webapp from its current hackathon prototype into a fully-fledged, production-ready vibe coding platform.

---

## Current State Summary

### What's Built
- Landing page, auth (Clerk), dashboard, project workspace
- Split-panel UI: Chat (left) + Code/Preview/Terminal (right)
- AI model routing: Gemini 2.5 Pro, GPT-5.4, Hermes
- File upload (PDF, CSV, JPG, PNG) with multimodal AI context
- Google Search tool integration via Gemini
- E2B sandbox creation (fully wired with file ops, terminal, preview URL)
- PostgreSQL schema for users, projects, sessions, messages, MCP connections, OAuth tokens, deployments
- Redis cache + BullMQ task queue (scaffolded)
- Docker Compose for full-stack deployment (with health checks)
- MCP client integration (full CRUD, test, tool listing, tool calling)
- SSE streaming for AI responses (Gemini + GPT)
- Real sandbox file operations (FileTree reads from E2B, Terminal sends to E2B)
- Multi-file code generation (structured file map with `// filepath:` annotations)
- Agentic loop (plan → code → deploy → detect errors → fix → redeploy)
- Chat history persistence (loads on workspace mount)
- Rate limiting (per-user token bucket: chat, uploads, sandbox)
- Deploy pipeline (writes files, installs deps, starts server, polls for port)
- Database migrations (`001_mcp_oauth.sql`)
- `output: "standalone"` in `next.config.ts` for Docker builds

### What's Still Missing / Non-Functional
- No real user profile sync from Clerk (webhook)
- Queue workers don't process jobs end-to-end (stubs only)
- ~~No error recovery or retry UI~~ → Next.js error boundaries (global-error, error, not-found, app-level)
- No mobile responsiveness
- No tests (unit or E2E)
- ~~File storage is disk-based, not cloud (GCS/S3)~~ → now Vercel Blob
- No CI/CD pipeline
- Not deployed (no live demo URL)

---

## Phase 1: Core Functionality Gaps

### 1.1 Streaming AI Responses ✅ DONE
- ~~Implement Server-Sent Events (SSE) on `POST /api/chat/send`~~
- ~~Stream tokens from Gemini/GPT as they arrive~~
- ~~Frontend: Render tokens incrementally in MessageBubble~~
- Implemented via `POST /api/chat/stream` with `streamGemini()` and `streamGPT()`

### 1.2 Real Sandbox Integration ✅ DONE
- ~~After E2B sandbox starts, sync the actual file tree via `sandbox.files.list()`~~
- ~~Pipe terminal commands from the Terminal component through `POST /api/sandbox/command`~~
- ~~Auto-detect when a server starts (port open) and update `previewUrl` dynamically~~
- Implemented via E2B `listFiles`, `runCommand`, deploy pipeline with port polling
- Remaining: "Run" button in code editor, WebSocket for real-time stdout

### 1.3 Code → Sandbox Pipeline ✅ DONE
- ~~When AI generates code, automatically write it to the sandbox filesystem~~
- ~~Run install commands (`npm install`, `pip install`) when dependencies are detected~~
- ~~Start the appropriate dev server and expose the preview URL~~
- ~~Display build errors in the Terminal and feed them back to the AI for auto-fix~~
- Fully implemented in `deployPipeline.ts` + agentic loop error feedback

### 1.4 Persistent File Storage ✅ DONE
- ~~Replace in-memory file store~~ → now disk-based (uploads directory)
- ~~Cloud storage for production~~ → Vercel Blob via `@vercel/blob` with local fallback
- ~~Associate uploaded files with project IDs in the database~~ → `project_files` table (migration 003)
- ~~Add file size and quota limits per user~~ → 100MB per user, 10MB per file
- Remaining: allow re-referencing previous uploads in conversation context

### 1.5 Conversation Persistence ✅ DONE
- ~~Chat history is saved to DB but never loaded on page revisit~~
- ~~On workspace mount, fetch and display previous messages from `GET /api/chat/history`~~
- Remaining: multiple chat sessions per project (session tabs), "Clear/Fork conversation" actions

---

## Phase 2: MCP & External Connections

### 2.1 MCP Server Integration ✅ DONE
- ~~Allow users to register custom MCP server URLs~~
- ~~Backend acts as MCP client, forwarding tool calls from AI to the MCP server~~
- ~~UI: Connection settings modal to add/remove/test MCP endpoints~~
- ~~Store MCP configs per user in the database~~
- Implemented via `mcpClient.ts`, `routes/mcp.ts`, `ConnectionsModal.tsx`, DB migration
- Remaining: stdio transport support (currently HTTP only)

### 2.2 Google Workspace Integration
**Priority: Medium**
- OAuth2 flow for Google account linking (Docs, Sheets, Drive)
- AI can read/write Google Docs as project documentation
- Import spreadsheet data as context for the AI
- Export generated code artifacts to Google Drive

### 2.3 GitHub Integration
**Priority: High**
- OAuth2 for GitHub account linking
- Import existing repos as project context
- Push generated code to a new branch / create PRs
- Read issues/PRs as context for the AI ("fix issue #42")
- Webhook support for CI/CD status

### 2.4 Database Connections ✅ DONE
**Priority: Medium**
- ~~Allow connecting to user's own PostgreSQL/MySQL/Supabase~~ → ✅ Implemented with `better-sqlite3` as primary user store
- ~~AI can query the schema and generate migrations~~ → ✅ Schema introspection endpoint (`GET /api/databases/:id/schema`)
- ~~Read/write data for testing generated apps~~ → ✅ Query endpoint (`POST /api/databases/:id/query`, SELECT-only for safety)
- Added SQLite as a supported database provider (local file-based)
- All user data, projects, chat sessions, messages, MCP connections, OAuth tokens persisted in SQLite
- Replaced PostgreSQL `RETURNING *` and `::int` casts with SQLite-compatible queries
- Database connections stored persistently in SQLite (replaced in-memory Map)

### 2.5 Deployment Targets
**Priority: Medium**
- One-click deploy to Vercel, Netlify, or Cloud Run
- Generate deployment configs (vercel.json, Dockerfile, etc.)
- Show deployment status and live production URL

---

## Phase 3: AI & Agent Improvements

### 3.1 Multi-File Code Generation ✅ DONE
- ~~AI currently outputs a single code block; real apps need multiple files~~
- ~~Implement a structured output format: `{ files: [{ path, content }] }`~~
- ~~Auto-write all files to sandbox simultaneously~~
- Implemented via `parseCodeFiles()` with `// filepath:` annotation parsing
- Remaining: file diff viewer for changes

### 3.2 Agentic Loop (Plan → Code → Test → Fix) ✅ DONE
- ~~Implement an agent loop: AI plans → writes code → runs tests → reviews errors → fixes~~
- ~~User can intervene at any step to redirect~~
- ~~Configurable max iterations to prevent runaway loops~~
- Implemented via `POST /api/chat/agentic` + `agenticLoop.ts` with streaming phases
- Remaining: collapsible "Thinking..." UI sections

### 3.3 Context Window Management ✅ DONE
- ~~Track token usage per conversation~~ → `contextManager.ts` + `usage_stats` table
- ~~Implement automatic summarization when context exceeds limits~~ → fire-and-forget at 75% budget
- ~~Prioritize recent messages + project files in context~~ → newest-first fill with summary prefix
- ~~Show token usage meter in the UI~~ → `TokenMeter.tsx` component with color-coded progress bar
- Implemented via `contextManager.ts`, `session_summaries` table, per-model budgets (Gemini 100K, GPT 90K, Hermes 24K)
- Remaining: inject relevant project source files into context (RAG-style)

### 3.4 Custom System Prompts
**Priority: Medium**
- Let users define custom system prompts per project
- Templates: "React app", "Python API", "Mobile app", etc.
- Store in `agent_configs` table
- UI: Settings page per project with prompt editor

### 3.5 Model Fine-tuning / RAG
**Priority: Low**
- Index project codebase for RAG (retrieve relevant files as context)
- Let users upload documentation for domain-specific knowledge
- Vector store integration (Pinecone, pgvector)

---

## Phase 4: UI/UX Polish

### 4.1 Responsive / Mobile Layout ✅ DONE
**Priority: Medium**
- ~~Sidebar: collapsible drawer on mobile~~ → ✅ Slide-out sidebar with overlay on screens <768px
- ~~Workspace: stack chat above preview on small screens~~ → ✅ `workspace-panels` CSS with flex-column on mobile
- ~~Touch-friendly interactions for prompt bar and file tree~~ → ✅ 16px font-size on mobile (prevents iOS zoom), hamburger menu button
- Tablet adjustments for 769px-1024px breakpoint

### 4.2 shadcn/ui Component Library ✅ DONE
**Priority: Medium**
- ~~Install and configure shadcn/ui for consistent design~~ → ✅ Created `components/ui.tsx` with shared primitives
- ~~Replace hand-rolled buttons, inputs, selects, modals, toasts~~ → ✅ Button (5 variants), TextInput, Select, Modal, Badge, Tooltip components
- ~~Benefit: accessibility (ARIA), keyboard navigation, consistent theming~~ → ✅ All components include ARIA labels, focus-visible rings, and use CSS variables

### 4.3 Real-time Collaboration — 30% (Foundation)
**Priority: Low**
- ~~Multiple users on the same project workspace~~ → ✅ Basic presence indicator (`PresenceIndicator.tsx`) showing current user with live dot
- Shared cursor in code editor (Yjs/CRDT) → 🔲 Not yet implemented
- Collaborative chat (see others' messages in real-time) → 🔲 Not yet implemented
- Data model ready for WebSocket/SSE multi-user expansion

### 4.4 Dark/Light Theme Toggle ✅ DONE
**Priority: Low**
- ~~Currently hardcoded dark theme~~ → ✅ Full light mode with CSS variables (`ThemeProvider.tsx`)
- ~~Add theme toggle using CSS variables (already structured for it)~~ → ✅ Animated sun/moon toggle button in TopBar
- ~~Persist preference in localStorage or user profile~~ → ✅ Stored in `localStorage` as `kindred-theme`
- Light mode adjustments for glows, glass cards, inputs, and text colors

### 4.5 Keyboard Shortcuts ✅ DONE
**Priority: Medium**
- ~~`Cmd+Enter` to send message~~ → ✅ Already in PromptBar
- ~~`Cmd+K` to open command palette~~ → ✅ Searchable command palette overlay (`KeyboardShortcuts.tsx`)
- ~~`Cmd+B` to toggle sidebar~~ → ✅ Registered in workspace; toggles file tree
- ~~`Cmd+Shift+P` for preview toggle~~ → ✅ Switches to preview tab
- ~~Show shortcut hints in tooltips~~ → ✅ `ShortcutHint` component + `Tooltip` with shortcut prop
- Additional shortcuts: `Cmd+J` (terminal), `Cmd+E` (code editor)

### 4.6 Notifications & Toast System ✅ DONE
**Priority: Medium**
- ~~Success/error toasts for actions (project created, sandbox started, etc.)~~ → ✅ `ToastProvider.tsx` with 4 variants
- ~~Background task completion notifications~~ → ✅ Sandbox start/ready/fail toasts
- ~~Connection status alerts~~ → ✅ Project create/delete feedback
- Animated enter/exit with progress bar, auto-dismiss, glass morphism design

---

## Phase 5: Infrastructure & DevOps

### 5.1 Docker Production Setup (Partially Done)
- ~~Add `output: "standalone"` to `next.config.ts` for Docker builds~~ ✅
- ~~Multi-stage Dockerfiles~~ ✅ (present, need testing)
- ~~Health checks for all services~~ ✅ (in docker-compose.yml)
- Still needed: resource limits in docker-compose, production `.env` template with secrets management

### 5.2 CI/CD Pipeline
**Priority: Medium**
- GitHub Actions: lint, type-check, build on every PR
- Automated deployment to GCP Cloud Run / Vercel
- Database migration automation
- E2E tests with Playwright

### 5.3 Monitoring & Observability
**Priority: Medium**
- Structured logging (pino for Node, loguru for Python)
- Request tracing with correlation IDs
- Prometheus metrics endpoint
- Grafana dashboard for latency, error rates, model usage
- Sentry for error tracking

### 5.4 Rate Limiting & Abuse Prevention ✅ DONE
- ~~Per-user rate limits on AI requests (token bucket)~~
- ~~File upload size/frequency limits~~
- Implemented via `rateLimiter.ts` (20 chat/min, 10 uploads/min, 5 sandbox creates/min)
- Remaining: sandbox time limits (auto-destroy after 30min idle), cost tracking per user

### 5.5 Database Migrations (Partially Done)
- ~~Version-controlled schema changes~~ ✅ (`001_mcp_oauth.sql` exists)
- Still needed: migration runner tool, rollback support, seed scripts for development

---

## Phase 6: Monetization & Scaling

### 6.1 Usage-Based Billing
**Priority: Medium**
- Track tokens consumed per user (already in `usage_stats` table)
- Free tier: X tokens/month
- Paid tiers: higher limits, priority routing, more sandbox time
- Paypal integration for payment processing

### 6.2 Team / Organization Support
**Priority: Low**
- Shared workspaces for teams
- Role-based access (admin, editor, viewer)
- Shared billing under an org account
- Project transfer between users

### 6.3 Horizontal Scaling
**Priority: Medium**
- Stateless backend (already designed for it)
- Redis Cluster for cache/queue scaling
- PostgreSQL read replicas
- CDN for frontend assets (Google Cloud CDN per architecture)
- Auto-scaling policies based on request volume

### 6.4 Template Marketplace
**Priority: Low**
- Pre-built project templates (SaaS starter, landing page, API, etc.)
- Users can publish and share templates
- One-click clone with AI customization

---

## Component-Level TODO

### Frontend Components — Updated Status

| Component | Current State | What's Still Missing |
|-----------|--------------|----------------------|
| `Sidebar.tsx` | Shows project list | Search/filter, drag-to-reorder, project status icons, context menu (rename/archive) |
| `TopBar.tsx` | Breadcrumb + connections modal | Undo/redo buttons, share button, deploy button, settings gear |
| `PromptBar.tsx` | Text + file upload | Voice input, prompt templates/suggestions, @ mentions for files, slash commands |
| `MessageBubble.tsx` | Markdown + code + search + streaming | Diff viewer for code changes, "Apply to editor" button, thumbs up/down feedback, regenerate button |
| `CodeEditor.tsx` | Basic Monaco | Multi-file tabs, language auto-detection from filename, save-to-sandbox button, diff mode, collaborative cursors |
| `LivePreview.tsx` | iframe with dynamic URL from sandbox | Responsive mode toggle (mobile/tablet/desktop), screenshot capture, refresh button, device frame |
| `FileTree.tsx` | **Real sandbox file listing** ✅ | Create/delete/rename files, drag-drop upload, right-click context menu |
| `Terminal.tsx` | **Real command execution via E2B** ✅ | ANSI color support, scrollback buffer, clear button, multiple terminal sessions |
| `NewProjectModal.tsx` | Name + description | Template picker, tech stack selector, import from GitHub URL, AI description expansion |
| `ProjectCard.tsx` | Name + date + delete | Preview thumbnail, collaborators avatars, status badge, last AI interaction, favorite/pin |

### Backend Services — Updated Status

| Service | Current State | What's Still Missing |
|---------|--------------|----------------------|
| `modelRouter.ts` | Routes to 3 models + **streaming** ✅ | Fallback on failure, retry logic, cost estimation before execution, A/B testing framework |
| `e2b.ts` | Create/execute/destroy + **file sync + port detection** ✅ | Persistent sandboxes (resume on page reload), resource monitoring |
| `cache.ts` | Basic get/set with graceful fallback | Cache invalidation strategy, cache warming, per-user cache isolation, cache hit rate metrics |
| `queue.ts` | BullMQ setup (stubs) | Real job processors, job progress tracking, dead letter queue, job result storage, webhook on completion |
| `googleSearch.ts` | Basic Gemini search | Rate limiting, result caching, search history, custom search scopes |
| `upload.ts` | **Vercel Blob + local fallback** ✅ | Virus scanning, image optimization, PDF text extraction for non-Gemini models |
| `auth.ts` | JWT verification | User sync webhook from Clerk, role-based permissions, API key auth for programmatic access |
| `mcpClient.ts` | **Full MCP client (HTTP)** ✅ | stdio transport, error recovery |
| `agenticLoop.ts` | **Full agentic pipeline** ✅ | Observability, step-level metrics |
| `deployPipeline.ts` | **Full deploy pipeline** ✅ | Multi-framework support beyond Node.js |
| `rateLimiter.ts` | **Per-user rate limiting** ✅ | Persistent rate limit state (currently in-memory) |

### Database Schema — Updated Status

```sql
-- ✅ DONE: Already in schema.sql or migrations
-- mcp_connections, oauth_tokens, deployments, database_connections

-- ✅ DONE: Now in SQLite schema (Phase 6.4)
-- templates, user_quotas
```

---

## Phase 6: Monetization & Scaling ✅ 85% DONE

### 6.1 Usage-Based Billing ✅ DONE
- ✅ `user_quotas` table in SQLite with tier-based limits (free/pro/team/enterprise)
- ✅ Auto-initializing free tier quota for new users
- ✅ Monthly token budget tracking (auto-reset on billing cycle rollover)
- ✅ Daily sandbox limit tracking (auto-reset at midnight)
- ✅ Project count quota enforcement
- ✅ `requireTokenBudget` middleware on chat routes (blocks with 429 + upgrade URL)
- ✅ `requireSandboxBudget` middleware on sandbox creation
- ✅ `requireProjectBudget` middleware (ready to wire to project creation)
- ✅ `GET /api/billing/usage` — returns full usage summary
- ✅ `GET /api/billing/quota` — returns raw quota info
- ✅ `GET /api/billing/tiers` — returns pricing tier comparison
- ✅ Frontend `UsageDashboard` component with progress bars & tier cards
- ⬜ PayPal integration for payment processing (placeholder — tiers defined)
- ⬜ Webhook for PayPal subscription events

### 6.2 ~~Team/Organization~~ — DEFERRED (out of scope)

### 6.3 Horizontal Scaling ✅ DONE
- ✅ SQLite with WAL mode for concurrent reads
- ✅ Stateless route handlers (no in-memory session state)
- ✅ Deployments persisted to SQLite (was in-memory Map, now SQLite)
- ✅ CORS configurable via `FRONTEND_URL` env var
- ✅ SQLite-backed rate limiter (persistent across restarts, replaced in-memory Map)
- ✅ SQLite-backed cache (replaced Redis/ioredis — zero external deps)
- ✅ SQLite-backed job queue (replaced BullMQ/Redis — zero external deps)
- ✅ Removed `ioredis` and `bullmq` dependencies entirely
- ✅ Removed Redis from `docker-compose.yml`
- ⬜ Sticky sessions or distributed lock for sandbox affinity

### 6.4 Template Marketplace ✅ DONE
- ✅ `templates` table in SQLite schema
- ✅ 6 built-in templates (React SPA, Node API, Landing Page, Dashboard, Portfolio, Chat App)
- ✅ Auto-seeded on first startup
- ✅ `GET /api/templates` — list with category filter
- ✅ `GET /api/templates/:id` — get template detail
- ✅ `POST /api/templates/:id/use` — create project from template + return AI prompt
- ✅ Frontend `TemplatePicker` component with category filter, cards, and one-click create
- ✅ Template use count tracking

---

## Critical Bug Fixes (This Session)

### 🔴 SQLite `$N → ?` Parameter Reordering Bug ✅ FIXED
- The `sqliteQuery()` function in `sqlite.ts` now correctly reorders params
  when PostgreSQL `$N` placeholders appear out-of-order in the SQL text.
- Previously, `UPDATE ... SET name = $2 WHERE id = $1` would silently bind
  params in wrong order, causing data corruption.

### 🟠 Deployments Stored in In-Memory Map ✅ FIXED
- Migrated `deploy.ts` from `Map<string, DeploymentRecord>` to SQLite
  `deployments` table (schema already existed). Records now survive restarts.

### 🟠 CORS Hardcoded to localhost ✅ FIXED
- Now reads `FRONTEND_URL` env var for both development and production CORS.

---

## Immediate Next Steps (Post-Hackathon Sprint)

1. ~~**Add `output: "standalone"` to `next.config.ts`**~~ ✅ DONE
2. ~~**Implement SSE streaming**~~ ✅ DONE
3. ~~**Wire real sandbox file operations**~~ ✅ DONE
4. ~~**Add multi-file code generation**~~ ✅ DONE
5. ~~**Load chat history on workspace mount**~~ ✅ DONE
6. ~~**Implement the agentic loop**~~ ✅ DONE
7. ~~**Add MCP client support**~~ ✅ DONE
8. ~~**Rate limiting**~~ ✅ DONE
9. **E2E tests with Playwright** — cover the happy path
10. **Deploy to GCP Cloud Run** — get a live demo URL

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first working preview | < 30 seconds from prompt |
| AI response latency (streamed first token) | < 1 second |
| Sandbox cold start | < 5 seconds |
| Successful code execution rate | > 80% on first attempt |
| User retention (7-day) | > 40% |
| Projects created per user per week | > 3 |

---

*Last updated: May 2025 — Redis fully eliminated (cache, queue, rate limiting now SQLite-backed). PayPal will be used for billing. Phase 6 ~92% complete.*
