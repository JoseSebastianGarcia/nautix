// Takes the screenshots used by the in-app help (apps/web/public/help/<name>-<dark|light>.png).
//
//   NAUTIX_ENGINE=fake NAUTIX_DATA=/tmp/help-data NAUTIX_PORT=3939 node apps/api/dist/main.js
//   NAUTIX_URL=http://127.0.0.1:3939 SETUP_TOKEN=<token printed on first run> \
//     node scripts/help-screenshots.mjs
//
// Playwright is resolved from PLAYWRIGHT_MODULE (a path) when it is not installed in the workspace.
// It only talks to the demo engine, so nothing real is touched.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env.NAUTIX_URL ?? "http://127.0.0.1:3939";
const out = fileURLToPath(new URL("../apps/web/public/help/", import.meta.url));
const password = "help-screenshots-1";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1280, height: 800 },
});
const api = context.request;
const call = async (method, path, data) => {
  const res = await api.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { "x-nautix-csrf": "1", origin: base },
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return res.status() === 204 ? null : res.json();
};

const session = await call("GET", "/auth/session");
if (session.setupRequired) {
  await call("POST", "/auth/setup", {
    setupToken: process.env.SETUP_TOKEN,
    username: "admin",
    password,
  });
}
await call("POST", "/auth/login", { username: "admin", password });

// A small shop: a database and an app on their own network, bound together, plus a DNS server.
const networks = await call("GET", "/networks");
let shop = networks.find((n) => n.name === "shop");
if (!shop) {
  await call("POST", "/networks", { name: "shop" });
  shop = (await call("GET", "/networks")).find((n) => n.name === "shop");
}
const have = new Set((await call("GET", "/containers")).map((c) => c.name));
const create = async (body) => {
  if (!have.has(body.name)) await call("POST", "/containers", body);
};
await create({
  name: "orders-db",
  image: "postgres:16-alpine",
  networkId: shop.id,
  env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "change-me", POSTGRES_DB: "orders" },
  volumes: ["orders-data:/var/lib/postgresql/data"],
});
await create({
  name: "orders-api",
  image: "myorg/orders-api:1.4",
  networkId: shop.id,
  ports: [{ containerPort: 8080, hostPort: 8080 }],
});
await create({
  name: "dns",
  image: "dockurr/dnsmasq:2.93",
  networkId: shop.id,
  ports: [{ containerPort: 53, protocol: "udp", hostPort: 5353 }],
});
if ((await call("GET", "/bindings")).length === 0)
  await call("POST", "/bindings", {
    consumer: "orders-api",
    provider: "orders-db",
    name: "Orders",
    style: "dotnet",
  });

const themes = ["dark", "light"];
const only = process.env.ONLY?.split(",");
const shoot = async (name, prepare) => {
  if (only && !only.includes(name)) return;
  for (const theme of themes) {
    const page = await context.newPage();
    await page.addInitScript(
      ([t]) => {
        localStorage.setItem("nautix.theme", t);
        localStorage.setItem("nautix.lang", "en");
      },
      [theme],
    );
    await prepare(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}${name}-${theme}.png` });
    await page.close();
    console.log(`${name}-${theme}.png`);
  }
};

// The page keeps an event stream open, so "network idle" never comes.
const settle = (page) => page.waitForTimeout(1200);

await shoot("topology", async (page) => {
  await page.goto("/");
  await settle(page);
  await page.getByText("orders-api").first().waitFor();
  await page.getByText("orders-api").first().click();
});

await shoot("bindings", async (page) => {
  await page.goto("/");
  await settle(page);
  await page.getByText("orders-api").first().click();
  await page.getByText("Bindings").first().scrollIntoViewIfNeeded();
});

await shoot("zone-spec", async (page) => {
  await page.goto("/zones/shop");
  await settle(page);
  // Change one value so the plan has something to show.
  await page.getByText("POSTGRES_DB").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("_v2");
});

await shoot("dns", async (page) => {
  await page.goto("/dns");
  await settle(page);
  for (const [domain, target] of [
    ["shop.home.lab", "orders-api"],
    ["db.home.lab", "192.168.1.20"],
  ]) {
    await page.getByPlaceholder("app.home.lab").fill(domain);
    await page.getByPlaceholder("my-app").fill(target);
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
  }
});

await shoot("guards", async (page) => {
  await page.goto("/guard");
  await settle(page);
  await page.getByLabel("Published port").selectOption({ index: 1 });
  await page.getByPlaceholder("10.0.0.0/24").fill("10.0.0.0/24, 192.168.1.5");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
});

await shoot("builds", async (page) => {
  await page.goto("/builds");
  await settle(page);
  await page.getByLabel("Containerize my app").selectOption({ label: "Node.js app" });
});

await shoot("apply-failure", async (page) => {
  await page.goto("/");
  await settle(page);
  await page.getByText("orders-api").first().click();
  await page.getByRole("button", { name: "Edit environment" }).first().click();
  // The demo engine rejects a change whose variable starts with NAUTIX_FAKE_FAIL, like a container that exits.
  await page.getByPlaceholder("KEY").fill("NAUTIX_FAKE_FAIL");
  await page.getByPlaceholder("value").fill("1");
  await page.getByPlaceholder("value").press("Enter");
  await page.getByRole("button", { name: /^Apply 1 change/ }).click();
  await page.getByText("rolled back").first().waitFor();
  // Take the trigger variable out of the list again: the failure message stays.
  await page.getByRole("button", { name: /Delete NAUTIX_FAKE_FAIL/ }).click();
});

await shoot("audit", async (page) => {
  const id = (await call("GET", "/containers")).find((c) => c.name === "orders-api")?.id;
  await call("PUT", `/containers/${id}/env`, {
    set: { LOG_LEVEL: "debug", API_KEY: "never-shown" },
    unset: ["OLD_FLAG"],
  });
  await call("GET", `/containers/${id}/inspect`);
  await page.goto(`/containers/${id}`);
  await settle(page);
  await page.getByRole("tab", { name: "History" }).click();
});

await browser.close();
