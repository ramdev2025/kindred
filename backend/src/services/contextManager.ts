/**
 * Context Window Manager
 *
 * Responsibilities:
 *  1. Estimate token usage without requiring an external tokenizer
 *  2. Build a context string that fits within the chosen model's budget
 *  3. Auto-summarize old messages (fire-and-forget) when budget is >75% full
 *  4. Return per-session stats so the UI can render a token-usage meter
 */

import * as db from '../db/queries';
import { processChat } from './modelRouter';

// ── Token budgets per model ──────────────────────────────────────────────────
// These are conservative limits — real context windows are larger,
// but we leave headroom for the system prompt and response tokens.
export const TOKEN_BUDGETS: Record<string, number> = {
  'gemini-2.5-pro': 100_000,
  'gpt-5.4':         90_000,
  'hermes':          24_000,
  'auto':            90_000,
};

const RESPONSE_RESERVE    = 8_000;  // tokens reserved for the model's output
const SUMMARIZE_THRESHOLD = 0.75;   // trigger summarization at 75% of budget
const TARGET_SUMMARY_TOKENS = 600;  // target length when asking AI to summarize
const MAX_MESSAGES_SCAN   = 100;    // scan at most this many messages per call

// ── Types ────────────────────────────────────────────────────────────────────
export interface ContextStats {
  messagesIncluded:  number;
  estimatedTokens:   number;   // tokens used by the context string we built
  totalSessionTokens: number;  // cumulative tokens across the entire session
  budget:            number;   // model's context budget
  usagePercent:      number;   // totalSessionTokens / budget × 100, clamped to 100
  hasSummary:        boolean;
  shouldSummarize:   boolean;  // true when a background summarization should be triggered
}

export interface ContextResult {
  context: string;
  stats:   ContextStats;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fast token estimator — no external deps.
 * English prose ≈ 4 chars/token; code ≈ 3 chars/token; mixed ≈ 3.5.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ── Core: build context ──────────────────────────────────────────────────────

/**
 * Build the context string passed to the AI on the next turn.
 *
 * Strategy (newest-first fill):
 *   1. Load the latest summary (if any) — counts towards the budget.
 *   2. Walk messages from newest → oldest, adding each until the budget is full.
 *   3. Prepend the summary so the AI always knows the project history.
 *
 * Returns both the context string and usage stats for the token-meter UI.
 */
export async function buildContext(
  sessionId:      string,
  preferredModel: string = 'auto',
): Promise<ContextResult> {
  const budget    = TOKEN_BUDGETS[preferredModel] ?? TOKEN_BUDGETS.auto;
  const available = budget - RESPONSE_RESERVE;

  // Cumulative tokens recorded by the DB (more accurate than re-estimating)
  const totalSessionTokens = await db.getSessionTokenUsage(sessionId);

  // Latest summary — messages at or before summarized_up_to are already captured
  const summary = await db.getLatestSummary(sessionId);

  // Load recent messages
  const allMessages = await db.getMessages(sessionId, MAX_MESSAGES_SCAN);

  // Only consider messages that aren't already in the summary
  const cutoff = summary?.summarized_up_to ?? null;
  const candidates = cutoff
    ? allMessages.filter((m) => m.created_at > cutoff)
    : allMessages;

  // Seed used-tokens with the summary overhead
  let usedTokens = summary ? estimateTokens(summary.summary_text) + 150 : 0;
  const selected: typeof allMessages = [];

  for (let i = candidates.length - 1; i >= 0; i--) {
    const msg     = candidates[i];
    const msgCost = estimateTokens(`${msg.role}: ${msg.content}`) + 10;
    if (usedTokens + msgCost > available) break;
    selected.unshift(msg);
    usedTokens += msgCost;
  }

  // Assemble final context string
  const parts: string[] = [];
  if (summary) {
    parts.push(`[CONVERSATION SUMMARY — earlier messages]\n${summary.summary_text}`);
  }
  if (selected.length > 0) {
    parts.push(selected.map((m) => `${m.role}: ${m.content}`).join('\n'));
  }
  const context = parts.join('\n\n---\n\n');

  const usagePercent    = Math.min(Math.round((totalSessionTokens / budget) * 100), 100);
  const shouldSummarize =
    !summary &&
    totalSessionTokens > budget * SUMMARIZE_THRESHOLD &&
    allMessages.length >= 6;

  return {
    context,
    stats: {
      messagesIncluded:   selected.length,
      estimatedTokens:    usedTokens,
      totalSessionTokens,
      budget,
      usagePercent,
      hasSummary:         !!summary,
      shouldSummarize,
    },
  };
}

// ── Background summarization ─────────────────────────────────────────────────

/**
 * Summarize the oldest messages in the session (all but the last 4).
 * Designed to be called fire-and-forget — it never throws to the caller.
 *
 * After success, the next call to buildContext will use the summary,
 * freeing budget for new messages.
 */
export async function summarizeSessionHistory(sessionId: string): Promise<void> {
  try {
    const allMessages = await db.getMessages(sessionId, MAX_MESSAGES_SCAN);
    if (allMessages.length < 6) return;

    // Keep the 4 most recent messages as "live" context; summarize the rest
    const toSummarize = allMessages.slice(0, -4);
    if (toSummarize.length === 0) return;

    // Truncate very long messages so the summarization prompt stays manageable
    const conversation = toSummarize
      .map((m) => `${m.role}: ${m.content.slice(0, 1_200)}`)
      .join('\n');

    const prompt =
      `You are summarizing a conversation between a developer and an AI coding assistant.\n` +
      `Create a CONCISE summary in under ${TARGET_SUMMARY_TOKENS} tokens that captures:\n` +
      `- What the user is building (goal, tech stack, framework)\n` +
      `- Key architectural decisions made\n` +
      `- Files and features that have been created\n` +
      `- Any unsolved problems or next steps mentioned\n\n` +
      `Write densely and factually. No preamble, no "This conversation is about…".\n\n` +
      `CONVERSATION:\n${conversation}`;

    const response = await processChat({
      message: prompt,
      preferredModel: 'gemini-2.5-pro', // always use fast model for summaries
    });

    const lastMsg = toSummarize[toSummarize.length - 1];
    await db.saveSessionSummary(
      sessionId,
      response.content,
      lastMsg.created_at,
      estimateTokens(response.content),
    );

    console.log(
      `[Context] Summarized ${toSummarize.length} messages for session ${sessionId} ` +
      `(~${estimateTokens(response.content)} tokens)`,
    );
  } catch (err) {
    console.warn('[Context] Auto-summarize failed:', (err as Error).message);
  }
}
