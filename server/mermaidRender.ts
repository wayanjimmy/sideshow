// Server-side mermaid rendering via Pele (https://pele.run) — the same
// { body, css } contract as richRender.ts, but in its own lazily-imported
// module: pele is only reachable when a mermaid surface actually renders, and
// keeping it out of richRender.ts means a mermaid-only workspace never loads
// shiki/@pierre (the boot-cost split app.ts already makes for the rich kinds).
//
// Runtime-agnostic: pele's render path touches no DOM (its canvas text-measurer
// probe fails closed to a pure-JS metrics table) and no `node:` imports —
// verified on workerd by test/workerIntegration. No WASM, no DOM globals.
//
// Mermaid source is untrusted agent content. pele escapes label text and
// block-lists javascript:/data: URLs; the output SVG string is wrapped by
// renderSandboxedPart (surfacePage.ts) in the opaque-origin sandboxed document
// under the tight rich CSP — never set as innerHTML in the trusted viewer.

import { PeleError, render } from "pele";
import { escapeHtml } from "./surfacePage.ts";
import { type Mode, type Palette, themeById } from "./themes.ts";
import type { MermaidSurface } from "./types.ts";

export type RenderedSurface = { body: string; css: string };
export type RenderOpts = { theme?: string; mode?: Mode };

// Pele themes via --pele-* CSS variables resolved at display time (not baked
// into the SVG), so the document's <style> can carry BOTH schemes under a
// prefers-color-scheme media query — same shape as shikiSchemeCss. That is why
// this module needs no per-scheme render and no in-frame JS: one SVG string
// re-colors with the theme.
function peleVars(p: Palette): Record<string, string> {
  return {
    "pele-bg": p.surface,
    "pele-fg": p.text,
    "pele-muted": p.muted,
    "pele-line": p.muted,
    "pele-surface": p.panel,
    "pele-surface-alt": p.bg,
    "pele-border": p.border2,
    "pele-accent": p.info.text,
    "pele-critical": p.danger.text,
    "pele-font": `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  };
}

const block = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `--${k}: ${v};`)
    .join("");

function peleSchemeCss(t: ReturnType<typeof themeById>, mode?: Mode): string {
  const light = block(peleVars(t.light));
  const dark = block(peleVars(t.dark));
  if (mode === "light") return `:root{${light}}`;
  if (mode === "dark") return `:root{${dark}}`;
  return `:root{${light}}@media (prefers-color-scheme: dark){:root{${dark}}}`;
}

const MERMAID_CSS = `
body { margin: 0; padding: 14px 16px; background: transparent; text-align: center; }
svg { max-width: 100%; height: auto; }
.pele-node.accent > rect, .pele-node.accent > polygon, .pele-node.accent > circle,
.pele-node.accent > path { fill: var(--accent-bg); stroke: var(--accent); }
.pele-node.accent text, .pele-node.accent tspan { fill: var(--accent); }
.pele-edge.accentLine path, path.accentLine { stroke: var(--accent); }
.mmd-error {
  text-align: left; color: var(--danger);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.mmd-error pre {
  margin: 6px 0 0; padding: 8px 10px; color: var(--text);
  background: var(--panel); border: 0.5px solid var(--border);
  border-radius: 8px; overflow: auto; white-space: pre-wrap;
}
`;

export async function renderMermaid(
  surface: MermaidSurface,
  opts: RenderOpts = {},
): Promise<RenderedSurface> {
  const theme = themeById(opts.theme);
  const src = surface.mermaid ?? "";
  let body: string;
  try {
    const { svg } = render(src, {
      // Explicit sane limits: a diagram's own frontmatter config can't raise
      // them. Keeps the synchronous DO render bounded.
      limit: 50_000,
      maxEdges: 5_000,
      outputLimit: 2_000_000,
      linkRel: "noopener noreferrer",
    });
    body = `<div class="mmd">${svg}</div>`;
  } catch (e) {
    // Match the old in-frame fallback: a message plus the source echoed so the
    // agent can see what failed. textContent-equivalent escaping keeps the
    // source inert (mermaid source becomes HTML only inside this sandboxed
    // iframe, and never as a script/executable context).
    const message =
      e instanceof PeleError ? e.message : e instanceof Error ? e.message : "parse error";
    body =
      `<div class="mmd-error">Couldn\u2019t render diagram \u2014 ${escapeHtml(message)}` +
      `<pre>${escapeHtml(src)}</pre></div>`;
  }
  return {
    body,
    css: MERMAID_CSS + peleSchemeCss(theme, opts.mode),
  };
}
