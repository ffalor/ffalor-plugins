// Minimal glob matcher for Bouncer path gates. Supports `*`, `**`, `?`,
// `{a,b}` alternation. Matches normalized full paths and basenames.
// Case-sensitive (paths); tool names are matched case-insensitively
// elsewhere, not here.

/** Convert one glob to a RegExp source anchored full-string. */
export function globToSource(glob: string): string {
  const g = glob.trim().replace(/\\/g, "/");
  let out = "";
  let i = 0;
  const n = g.length;
  while (i < n) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") {
        if (g[i + 2] === "/") {
          out += "(?:.*/)?"; // `**/` matches zero or more dirs
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      out += "[^/]";
      i += 1;
    } else if (c === "{") {
      const close = g.indexOf("}", i);
      if (close < 0) {
        out += "\\{";
        i += 1;
      } else {
        const parts = g.slice(i + 1, close).split(",");
        out += "(?:" + parts.map((p) => globToSource(p)).join("|") + ")";
        i = close + 1;
      }
    } else if (c === ".") {
      out += "\\.";
      i += 1;
    } else if (c === "+") {
      out += "\\+";
      i += 1;
    } else if (c === "^") {
      out += "\\^";
      i += 1;
    } else if (c === "$") {
      out += "\\$";
      i += 1;
    } else if (c === "(") {
      out += "\\(";
      i += 1;
    } else if (c === ")") {
      out += "\\)";
      i += 1;
    } else if (c === "|") {
      out += "\\|";
      i += 1;
    } else if (c === "[") {
      out += "\\[";
      i += 1;
    } else if (c === "]") {
      out += "\\]";
      i += 1;
    } else if (c === "\\") {
      out += "\\\\";
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

export function globMatches(glob: string, path: string): boolean {
  try {
    const re = new RegExp("^(?:" + globToSource(glob) + ")$");
    const p = path.replace(/\\/g, "/");
    const slash = p.lastIndexOf("/");
    const base = slash < 0 ? p : p.slice(slash + 1);
    return re.test(p) || re.test(base);
  } catch {
    return false;
  }
}

/** True when any glob matches the path (full or basename). */
export function anyGlobMatches(globs: readonly string[], path: string): boolean {
  for (const g of globs) {
    if (globMatches(g, path)) return true;
  }
  return false;
}
