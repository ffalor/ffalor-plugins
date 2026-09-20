// Tool-call guard: deny or annotate risky tool calls before they run.
//
// Every $.noun.event(...) call is spelled out at the call site below;
// helpers only ever receive plain data, never $.
import type { On, PluginOptions } from "claude-code";

import { normalizeConfig, toolShouldInterrupt } from "./bouncer-config";
import type { BouncerConfig } from "./bouncer-config";
import { compileRules, ruleNameOf } from "./bouncer-rules";
import type { CompiledRule, RuleFile } from "./bouncer-rules";
import { matchToolRules, renderCorrection, toolCandidates } from "./bouncer-match";
import {
  STORE_KEY,
  asStoreDoc,
  marksForSession,
  recordInMemory,
  selectEligible,
  withRecorded,
} from "./bouncer-state";
import type { LoopMarks } from "./bouncer-state";

interface RulesCache {
  key: string;
  rules: CompiledRule[];
}

function providersFor(
  cwd: string,
  home: string | undefined,
): { dir: string; label: string; native: boolean }[] {
  const providers: { dir: string; label: string; native: boolean }[] = [];
  if (cwd) {
    providers.push({ dir: cwd.replace(/\/+$/, "") + "/.claude/rules", label: "project .claude/rules", native: true });
    providers.push({ dir: cwd.replace(/\/+$/, "") + "/.claude/bouncer-rules", label: "project .claude/bouncer-rules", native: false });
  }
  if (home) {
    providers.push({ dir: home.replace(/\/+$/, "") + "/.claude/rules", label: "user ~/.claude/rules", native: true });
    providers.push({ dir: home.replace(/\/+$/, "") + "/.claude/bouncer-rules", label: "user ~/.claude/bouncer-rules", native: false });
  }
  return providers;
}


export function register(on: On, options: PluginOptions) {
  const config: BouncerConfig = normalizeConfig(options);
  let cache: RulesCache | null = null;
  let memory: Record<string, LoopMarks> = {};
  let chain: Promise<void> = Promise.resolve();
  let loggedForKey: string | null = null;

  on("tool.call", async ($, e, next) => {
    if (!config.enabled) return next(e);
    const tool = (e as unknown as { tool: string }).tool;
    if (typeof tool !== "string" || tool.length === 0) return next(e);
    const agentId = (e as unknown as { agentId?: string }).agentId;

    let sessionId = "";
    try {
      sessionId = await $.session.id();
    } catch {
      sessionId = "";
    }
    let cwd = "";
    try {
      cwd = await $.session.cwd();
    } catch {
      cwd = "";
    }
    const cacheKey = sessionId + "\n" + cwd;
    if (cache === null || cache.key !== cacheKey) {
      let home: string | undefined;
      try {
        const h =
          (await $.env.get("HOME").catch(() => undefined)) ??
          (await $.env.get("USERPROFILE").catch(() => undefined));
        home = typeof h === "string" && h.length > 0 ? h : undefined;
      } catch {
        home = undefined;
      }
      const providers = providersFor(cwd, home);
      const files: RuleFile[] = [];
      for (const provider of providers) {
        let names: string[];
        try {
          const entries = await $.fs.list(provider.dir);
          names = entries
            .map((entry) => entry.name)
            .filter((n) => ruleNameOf(n) !== null)
            .sort();
        } catch {
          continue;
        }
        for (const filename of names) {
          const path = provider.dir + "/" + filename;
          let text: string;
          try {
            text = (await $.fs.read(path)) as string;
          } catch {
            continue;
          }
          const name = ruleNameOf(filename);
          if (name !== null) {
            files.push({ name, text, label: provider.label, file: path, native: provider.native });
          }
        }
      }
      const found = compileRules(files, config.disabledRules);
      cache = { key: cacheKey, rules: found.rules };
      if (loggedForKey !== cacheKey) {
        loggedForKey = cacheKey;
        for (const line of found.diagnostics.slice(0, 8)) {
          try {
            $.ui.log(line);
          } catch {
            break;
          }
        }
      }
    }
    const rules = cache.rules;
    if (rules.length === 0) return next(e);

    const sid = sessionId;
    await chain
      .then(async () => {
        if (memory[sid]) return;
        let raw: unknown;
        try {
          raw = await $.store.get(STORE_KEY);
        } catch {
          return;
        }
        memory[sid] = marksForSession(asStoreDoc(raw), sid);
      })
      .catch(() => undefined);
    let turns = 0;
    try {
      turns = await $.session.turns();
    } catch {
      turns = 0;
    }
    const info = { sessionId: sid, loop: agentId ?? "main", turns };

    const rawArgs = e as unknown as Record<string, unknown>;
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawArgs)) {
      if (k !== "tool" && k !== "tool_use_id" && k !== "agentId") args[k] = v;
    }
    const candidates = toolCandidates(tool, args);
    if (candidates.length === 0) return next(e);
    const matched = matchToolRules(rules, tool, candidates, agentId);
    if (matched.length === 0) return next(e);
    const eligible = selectEligible(
      matched,
      memory[sid] ?? {},
      info,
      config.repeatMode,
      config.repeatGap,
    );
    if (eligible.length === 0) return next(e);

    const interrupting = eligible.filter((r) =>
      toolShouldInterrupt(config.interruptMode, r.interruptMode),
    );
    if (interrupting.length > 0) {
      recordInMemory(memory, info, interrupting);
      chain = chain
        .then(async () => {
          let raw: unknown;
          try {
            raw = await $.store.get(STORE_KEY);
          } catch {
            return;
          }
          const doc = withRecorded(asStoreDoc(raw), info, interrupting);
          try {
            await $.store.set(STORE_KEY, doc);
          } catch {
            // Persistence is best-effort; memory marks still suppress repeats.
          }
        })
        .catch(() => undefined);
      try {
        $.ui.toast(`Bouncer: ${interrupting.map((r) => r.name).join(", ")}`);
      } catch {
        // Headless or toastless surfaces: enforcement never depends on UI.
      }
      return { deny: renderCorrection(interrupting) };
    }

    const answered = await next(e);
    if (answered !== null && typeof answered === "object" && "deny" in answered) {
      return answered; // a lower hook already refused; nothing delivered
    }
    recordInMemory(memory, info, eligible);
    chain = chain
      .then(async () => {
        let raw: unknown;
        try {
          raw = await $.store.get(STORE_KEY);
        } catch {
          return;
        }
        const doc = withRecorded(asStoreDoc(raw), info, eligible);
        try {
          await $.store.set(STORE_KEY, doc);
        } catch {
          // Best-effort, as above.
        }
      })
      .catch(() => undefined);
    if (answered !== null && typeof answered === "object" && "result" in answered) {
      const prev = (answered as { context?: readonly string[] }).context ?? [];
      return { ...answered, context: [...prev, renderCorrection(eligible)] };
    }
    return answered;
  });
}
