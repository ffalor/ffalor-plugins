// Repeat suppression: `once` per session+loop, `after-gap` by completed
// user turns. All persistence primitives here are pure functions over
// plain data; register.ts owns the memory map and makes every $.store
// call directly (hook modules must spell $.noun.event(...) at the call
// site, never pass $ into helpers). A rule whose digest changed since
// its mark is treated as edited and re-arms.

import type { RepeatMode } from "./bouncer-config";
import type { CompiledRule } from "./bouncer-rules";

export interface TurnInfo {
  sessionId: string;
  loop: string; // agentId or "main"
  turns: number; // completed user turns via $.session.turns()
}

export interface Mark {
  turn: number;
  digest: string;
}

/** loop -> lowercase rule name -> mark */
export type LoopMarks = Record<string, Record<string, Mark>>;

export const STORE_KEY = "bouncer.v1.marks";
const MAX_SESSIONS = 20;

function isMark(v: unknown): v is Mark {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m["turn"] === "number" && typeof m["digest"] === "string";
}

/** Normalize unknown store content to sessionId -> LoopMarks. */
export function asStoreDoc(v: unknown): Record<string, LoopMarks> {
  if (typeof v !== "object" || v === null) return {};
  const doc: Record<string, LoopMarks> = {};
  for (const [sid, loops] of Object.entries(v as Record<string, unknown>)) {
    if (typeof loops !== "object" || loops === null) continue;
    const clean: LoopMarks = {};
    for (const [loop, rules] of Object.entries(loops as Record<string, unknown>)) {
      if (typeof rules !== "object" || rules === null) continue;
      const kept: Record<string, Mark> = {};
      for (const [rule, mark] of Object.entries(rules as Record<string, unknown>)) {
        if (isMark(mark)) kept[rule] = mark;
      }
      clean[loop] = kept;
    }
    doc[sid] = clean;
  }
  return doc;
}

/** Marks for one session (empty when never persisted). */
export function marksForSession(doc: Record<string, LoopMarks>, sessionId: string): LoopMarks {
  const loops = doc[sessionId];
  if (!loops) return {};
  const copy: LoopMarks = {};
  for (const [loop, rules] of Object.entries(loops)) copy[loop] = { ...rules };
  return copy;
}

/** Keep only rules still eligible under the repeat policy. */
export function selectEligible(
  rules: readonly CompiledRule[],
  marks: LoopMarks,
  info: TurnInfo,
  mode: RepeatMode,
  gap: number,
): CompiledRule[] {
  const perLoop = marks[info.loop] ?? {};
  return rules.filter((r) => {
    const mark = perLoop[r.name.toLowerCase()];
    if (!mark) return true;
    if (mark.digest !== r.digest) return true; // rule edited: re-arm
    if (mode === "once") return false;
    return info.turns - mark.turn >= gap;
  });
}

/** Record delivery in a memory map (mutates and returns it). */
export function recordInMemory(
  memory: Record<string, LoopMarks>,
  info: TurnInfo,
  rules: readonly CompiledRule[],
): Record<string, LoopMarks> {
  memory[info.sessionId] ??= {};
  memory[info.sessionId]![info.loop] ??= {};
  const perLoop = memory[info.sessionId]![info.loop]!;
  for (const r of rules) perLoop[r.name.toLowerCase()] = { turn: info.turns, digest: r.digest };
  return memory;
}

/** Fold delivery marks into a store doc, pruning oldest sessions. */
export function withRecorded(
  doc: Record<string, LoopMarks>,
  info: TurnInfo,
  rules: readonly CompiledRule[],
): Record<string, LoopMarks> {
  const out: Record<string, LoopMarks> = { ...doc };
  const loops: LoopMarks = { ...(out[info.sessionId] ?? {}) };
  const perLoop: Record<string, Mark> = { ...(loops[info.loop] ?? {}) };
  for (const r of rules) perLoop[r.name.toLowerCase()] = { turn: info.turns, digest: r.digest };
  loops[info.loop] = perLoop;
  out[info.sessionId] = loops;
  const ids = Object.keys(out);
  for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete out[stale];
  return out;
}
