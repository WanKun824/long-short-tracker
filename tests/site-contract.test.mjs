import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships all eight institutions with complete disclosed holdings", async () => {
  const raw = await readFile(new URL("app/data/holdings.json", root), "utf8");
  const holdings = JSON.parse(raw);
  assert.equal(Object.keys(holdings).length, 8);
  assert.equal(Object.values(holdings).reduce((sum, rows) => sum + rows.length, 0), 246);
  for (const rows of Object.values(holdings)) {
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => typeof row.ticker === "string" && typeof row.weight === "number"));
  }
});

test("includes Chinese research, subscription and disclosure experiences", async () => {
  const [page, profiles, refresh, subscribe, layout] = await Promise.all([
    readFile(new URL("app/components/PortfolioExplorer.tsx", root), "utf8"),
    readFile(new URL("app/data/funds.ts", root), "utf8"),
    readFile(new URL("app/api/refresh/route.ts", root), "utf8"),
    readFile(new URL("app/api/subscribe/route.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /看懂全球顶级资本/);
  assert.match(page, /订阅持仓变动/);
  assert.match(page, /13F是一张延迟的X光片/);
  assert.match(profiles, /Situational Awareness LP/);
  assert.match(profiles, /Warren Buffett/);
  assert.match(refresh, /refreshHoldings/);
  assert.match(subscribe, /subscribers/);
  assert.match(layout, /\/og\.png/);
  await access(new URL("public/og.png", root));
});
