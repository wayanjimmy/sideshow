---
"sideshow": minor
---

Mermaid surfaces now render server-side with Pele (pele.run) instead of loading
mermaid.js from a CDN in the browser: no third-party CDN dependency, tighter
CSP on mermaid frames, and publish-time validation now covers all diagram types
(flowchart and sequence diagrams were previously unchecked). Diagram visual
layout differs from mermaid.js rendering.
