import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
  const [page, profiles, refreshRoute, refreshWorker, changes, subscribe, status, layout] = await Promise.all([
    readFile(new URL("app/components/PortfolioExplorer.tsx", root), "utf8"),
    readFile(new URL("app/data/funds.ts", root), "utf8"),
    readFile(new URL("app/api/refresh/route.ts", root), "utf8"),
    readFile(new URL("app/lib/refreshHoldings.ts", root), "utf8"),
    readFile(new URL("app/lib/holdingChanges.ts", root), "utf8"),
    readFile(new URL("app/api/subscribe/route.ts", root), "utf8"),
    readFile(new URL("app/api/status/route.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /美国机构投资者/);
  assert.match(page, /13F数据库/);
  assert.match(page, /持仓数据库/);
  assert.doesNotMatch(page, /13F机构持仓/);
  assert.match(page, /订阅持仓变动/);
  assert.match(page, /13F数据范围与限制/);
  assert.doesNotMatch(page, /穿过持仓表|看见投资人的判断|不是答案|延迟的X光片/);
  assert.match(page, /如何启用真实邮件发送/);
  assert.match(profiles, /Situational Awareness LP/);
  assert.match(profiles, /Michael Burry/);
  assert.match(profiles, /The Big Short/);
  assert.match(profiles, /managerBio/);
  const managerImages = [...profiles.matchAll(/image: "(\/people\/[^"]+)"/g)].map((match) => match[1]);
  assert.equal(managerImages.length, 8);
  for (const imagePath of managerImages) {
    const imageFile = await stat(new URL(`public${imagePath}`, root));
    assert.ok(imageFile.size > 5_000);
  }
  assert.match(refreshRoute, /refreshHoldings/);
  assert.match(refreshWorker, /retryPendingAlerts/);
  assert.match(refreshWorker, /DELIVERY_CLAIM_SQL/);
  assert.match(changes, /buildAlertEmail/);
  assert.match(subscribe, /subscribers/);
  assert.match(page, /数据检查/);
  assert.match(page, /邮件提醒/);
  assert.match(status, /emailReady/);
  assert.match(status, /lastRefreshAt/);
  assert.match(layout, /Newsreader/);
});
