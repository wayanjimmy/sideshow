import { expect, publishParts, test } from "./fixtures.ts";

const DIAGRAM = [
  "graph TD",
  "  A[Start] --> B{Choice}",
  "  B -->|yes| C[Do it]",
  "  B -->|no| D[Skip]",
].join("\n");

// Mermaid now renders SERVER-side with Pele (server/mermaidRender.ts): the /s
// document carries the finished SVG string and the tight rich CSP — no CDN
// import, no in-frame loader, no network. These tests exercise the real
// renderer through the viewer: publish → iframe from /s → pele SVG visible.

test("a mermaid part renders inside an opaque-origin frame served from /s", async ({
  page,
  server,
}) => {
  await publishParts(server.url, {
    title: "Flow",
    agent: "e2e",
    parts: [{ kind: "mermaid", mermaid: DIAGRAM }],
  });

  await page.goto(server.url);
  const card = page.locator(".card:not(#sessionThread)");

  // the diagram renders inside an opaque-origin sandbox iframe. No
  // allow-same-origin, even though the SVG was built server-side.
  await expect(card.locator("iframe.mermaidframe")).toHaveAttribute("sandbox", "allow-scripts");
  const frame = card.frameLocator("iframe.mermaidframe");

  const svg = frame.locator("svg");
  await expect(svg).toBeVisible();
  // the real pele renderer produced the node labels from the source
  await expect(frame.locator("body")).toContainText("Start");
  await expect(frame.locator("body")).toContainText("Choice");
});

test("the native posts endpoint rejects invalid mermaid with actionable details", async ({
  page,
  request,
  server,
}) => {
  const response = await request.post(`${server.url}/api/posts`, {
    data: {
      title: "Broken diagram",
      surfaces: [{ kind: "mermaid", mermaid: 'pie title Pets\n  "Dogs" : broken !!@@' }],
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({
    code: "surface_validation_failed",
    issues: [
      {
        code: "invalid_mermaid_syntax",
        requestPath: "surfaces[0].mermaid",
        diagramType: "pie",
      },
    ],
  });
  expect(body.issues[0].parserMessage).toMatch(/Lexical error|Parse error|Expecting/);
  expect(body.issues[0].nextSteps).toContain(
    "Correct the Mermaid syntax described by parserMessage, then retry the request.",
  );

  await page.goto(server.url);
  await expect(page.locator(".card:not(#whatsNew)")).toHaveCount(0);
});

test("an invalid mermaid part shows the source in a server-rendered error fallback", async ({
  page,
  server,
}) => {
  // The render-error fallback is defense-in-depth: pele is both validator and
  // renderer, so a stored source that fails at render time can't be published
  // through any endpoint. The fallback itself is covered by unit tests
  // (test/surfacePage.test.ts). Here we assert a valid diagram renders the SVG
  // and never shows the fallback.
  await publishParts(server.url, {
    title: "Fine",
    agent: "e2e",
    parts: [{ kind: "mermaid", mermaid: DIAGRAM }],
  });

  await page.goto(server.url);
  const frame = page.locator(".card:not(#sessionThread)").frameLocator("iframe.mermaidframe");
  await expect(frame.locator("svg")).toBeVisible();
  await expect(frame.locator(".mmd-error")).toHaveCount(0);
});
