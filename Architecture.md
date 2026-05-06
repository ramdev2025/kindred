# Vibe Coding Webapp with Google ADK, Clerk, Model Routing, and E2B

A full-stack webapp that lets users build applications via natural‑language vibe coding. The UI uses Clerk for seamless authentication and talks to a Google ADK Orchestrator (Node.js/TS). The Orchestrator manages user sessions, dynamically routes requests between cloud LLMs (Gemini Pro / GPT-5.4), or delegates deep reasoning to a local Hermes agent. To support true full-stack live previews, the Orchestrator spins up ephemeral E2B micro-VMs where agents can securely execute, test, and host the generated backend or frontend code.

## Components (10)

- **Vibe Coding Frontend** (frontend) — React/Next.js UI where users describe app ideas, view terminal outputs, and interact with live, running previews. Integrates Clerk for authentication.
- **Clerk Authentication Service** (auth) — External identity provider handling user sign-ups, logins, and JWT generation, ensuring secure access to workspaces.
- **Google ADK Orchestrator** (backend) — Node.js/Express.js agent built with the Google Agents CLI. It verifies Clerk JWTs, routes LLM requests, manages state, and orchestrates the E2B SDK to spawn cloud sandboxes for code execution.
- **Model Routing Layer (Gemini 2.5 Pro / GPT-5.4)** (external) — The cloud AI layer called by the ADK Orchestrator for rapid context handling (Gemini) or complex agentic code transformations (GPT-5.4).
- **E2B Code Execution Sandbox** (sandbox) — Ephemeral, secure cloud micro-VMs provisioned dynamically via the E2B SDK. Allows the AI models to safely run terminal commands, install dependencies (e.g., `npm install`, `pip install`), execute generated backend servers, and expose live preview URLs back to the frontend.
- **Hermes Worker API** (service) — Python FastAPI service wrapping a local Hermes agent for deep, stateful reasoning and specialized offline tasks.
- **Agent Configuration Database** (database) — PostgreSQL instance storing user profiles (linked to Clerk IDs), agent definitions, prompts, and code artifacts.
- **Background Task Queue** (queue) — Redis‑backed queue for offloading heavy reasoning jobs or long-running E2B environment builds.
- **Response Cache** (cache) — Redis cache layer storing recent responses and code snippets to avoid duplicate compute.
- **Static Asset CDN** (cdn) — Google Cloud CDN serving the frontend's static assets globally.

## Connections (13)

- Vibe Coding Frontend ↔ Clerk Authentication Service — Authenticate user & retrieve session JWT
- Vibe Coding Frontend → Google ADK Orchestrator — User actions & requests (with Clerk JWT)
- Vibe Coding Frontend ↔ E2B Code Execution Sandbox — User interacts directly with the live preview URL exposed by E2B
- Google ADK Orchestrator ↔ Clerk Authentication Service — Verify token and fetch user metadata
- Google ADK Orchestrator → Model Routing Layer — Request completions
- Google ADK Orchestrator ↔ E2B Code Execution Sandbox — Spawn micro-VMs, push generated code, run commands, and read logs/errors
- Google ADK Orchestrator → Hermes Worker API — Delegate deep reasoning task
- Google ADK Orchestrator → Agent Configuration Database — Read/write agent configs & artifacts
- Google ADK Orchestrator → Background Task Queue — Enqueue long-running jobs
- Background Task Queue → Hermes Worker API — Worker pulls queued prompts
- Hermes Worker API → Response Cache — Cache reasoning results
- Response Cache → Google ADK Orchestrator — Fetch cached responses
- Static Asset CDN → Vibe Coding Frontend — Serve static UI assets