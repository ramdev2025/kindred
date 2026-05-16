/**
 * Research API client — mirrors the pattern in lib/api.ts
 * Talks to /api/research/* on the Express backend, which proxies to the ADK service.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:3001");

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResearchEventType =
  | "search_query"
  | "search_result"
  | "token"
  | "need_input"
  | "input_received"
  | "done"
  | "error";

export interface ResearchSSEEvent {
  type: ResearchEventType;
  content?: string;
  question?: string;
  session_id?: string;
  cached?: boolean;
}

export interface StartResearchResponse {
  session_id: string;
  status: string;
  message: string;
}

export interface SessionStatus {
  session_id: string;
  status: string;
  pending_question: string | null;
  created_at: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function startResearch(
  token: string,
  message: string,
  context?: string,
): Promise<StartResearchResponse> {
  const res = await fetch(`${API_BASE}/api/research/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, context: context || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to start research" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendHumanAnswer(
  token: string,
  sessionId: string,
  answer: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/research/${sessionId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to send answer" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

export async function getSessionStatus(
  token: string,
  sessionId: string,
): Promise<SessionStatus> {
  const res = await fetch(`${API_BASE}/api/research/${sessionId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * openResearchStream — returns a ReadableStream of SSE lines from the backend.
 * The caller is responsible for reading and parsing events.
 * Returns an AbortController so the caller can cancel the stream.
 */
export function openResearchStream(
  token: string,
  sessionId: string,
  onEvent: (event: ResearchSSEEvent) => void,
  onClose?: () => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/research/${sessionId}/stream`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        onEvent({ type: "error", content: `Stream failed: HTTP ${response.status}` });
        onClose?.();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === ": keepalive") continue;
          try {
            const parsed: ResearchSSEEvent = JSON.parse(raw);
            onEvent(parsed);
            if (parsed.type === "done" || parsed.type === "error") {
              reader.cancel();
              onClose?.();
              return;
            }
          } catch {
            /* ignore malformed lines */
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        onEvent({ type: "error", content: err.message || "Stream connection lost" });
      }
    } finally {
      onClose?.();
    }
  })();

  return controller;
}
