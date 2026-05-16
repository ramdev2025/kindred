/**
 * useResearchStream
 * Manages the full lifecycle of a Deep Research ADK session:
 *   - Starting a session via POST /api/research/start
 *   - Consuming the SSE stream
 *   - Pausing for human-in-the-loop (HITL) input on need_input events
 *   - Resuming after the human answers
 *   - Collecting the final synthesized answer
 */

"use client";

import { useCallback, useRef, useState } from "react";
import {
  openResearchStream,
  sendHumanAnswer,
  startResearch,
  type ResearchSSEEvent,
} from "@/lib/research";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResearchStatus =
  | "idle"
  | "starting"
  | "streaming"
  | "awaiting_input"
  | "complete"
  | "error";

export interface ResearchEvent {
  id: string;
  type: ResearchSSEEvent["type"];
  content?: string;
  question?: string;
  timestamp: number;
}

export interface UseResearchStreamResult {
  status: ResearchStatus;
  events: ResearchEvent[];
  answer: string;
  pendingQuestion: string | null;
  sessionId: string | null;
  error: string | null;
  isCached: boolean;
  startResearch: (message: string, context?: string) => Promise<void>;
  sendAnswer: (answer: string) => Promise<void>;
  reset: () => void;
  cancel: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useResearchStream(token: string | null): UseResearchStreamResult {
  const [status, setStatus] = useState<ResearchStatus>("idle");
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [answer, setAnswer] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const eventCountRef = useRef(0);

  const addEvent = useCallback((event: Omit<ResearchEvent, "id" | "timestamp">) => {
    const id = `evt-${Date.now()}-${eventCountRef.current++}`;
    setEvents((prev) => [...prev, { ...event, id, timestamp: Date.now() }]);
  }, []);

  const handleSSEEvent = useCallback(
    (raw: ResearchSSEEvent) => {
      switch (raw.type) {
        case "search_query":
          addEvent({ type: "search_query", content: raw.content });
          break;
        case "search_result":
          addEvent({ type: "search_result", content: raw.content });
          break;
        case "token":
          setAnswer((prev) => prev + (raw.content || ""));
          break;
        case "need_input":
          setStatus("awaiting_input");
          setPendingQuestion(raw.question || null);
          addEvent({ type: "need_input", question: raw.question });
          break;
        case "input_received":
          setStatus("streaming");
          setPendingQuestion(null);
          addEvent({ type: "input_received", content: raw.content });
          break;
        case "done":
          setStatus("complete");
          if (raw.cached) setIsCached(true);
          addEvent({ type: "done" });
          break;
        case "error":
          setStatus("error");
          setError(raw.content || "Unknown error");
          addEvent({ type: "error", content: raw.content });
          break;
      }
    },
    [addEvent],
  );

  const start = useCallback(
    async (message: string, context?: string) => {
      if (!token) { setError("Not authenticated"); return; }

      abortRef.current?.abort();
      setStatus("starting");
      setEvents([]);
      setAnswer("");
      setPendingQuestion(null);
      setError(null);
      setIsCached(false);
      setSessionId(null);

      try {
        const { session_id } = await startResearch(token, message, context);
        setSessionId(session_id);
        setStatus("streaming");

        abortRef.current = openResearchStream(
          token,
          session_id,
          handleSSEEvent,
          () => {
            setStatus((prev) =>
              prev === "streaming" || prev === "awaiting_input" ? "complete" : prev,
            );
          },
        );
      } catch (err: any) {
        setStatus("error");
        setError(err.message || "Failed to start research");
      }
    },
    [token, handleSSEEvent],
  );

  const sendAnswer = useCallback(
    async (ans: string) => {
      if (!token || !sessionId) return;
      try {
        await sendHumanAnswer(token, sessionId, ans);
      } catch (err: any) {
        setError(err.message || "Failed to send answer");
      }
    },
    [token, sessionId],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setEvents([]);
    setAnswer("");
    setPendingQuestion(null);
    setSessionId(null);
    setError(null);
    setIsCached(false);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  return {
    status, events, answer, pendingQuestion,
    sessionId, error, isCached,
    startResearch: start, sendAnswer, reset, cancel,
  };
}
