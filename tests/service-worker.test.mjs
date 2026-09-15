import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://study.example";
const base = `${origin}/english-review-drill/`;
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function harness() {
  const handlers = new Map();
  const stored = new Map();
  const keyOf = (request) => typeof request === "string" ? request : request.url;
  const cache = {
    put: async (request, response) => stored.set(keyOf(request), response.clone()),
    match: async (request) => stored.get(keyOf(request))?.clone(),
  };
  const fetch = vi.fn(async (request) => new Response(keyOf(request) === base
    ? '<script src="/english-review-drill/assets/main.js"></script>'
    : "fresh"));
  vm.runInNewContext(source, {
    URL, Response, fetch,
    caches: { open: async () => cache },
    self: {
      location: { href: `${base}sw.js?v=test`, origin },
      registration: { scope: base },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
  });
  return { handlers, stored, fetch };
}

describe("service worker supplemental data", () => {
  it("precaches both card datasets with the app shell", async () => {
    const { handlers, stored } = harness();
    let completion;
    handlers.get("install")({ waitUntil: (promise) => completion = promise });
    await completion;
    expect(stored.has(`${base}data/cards.json`)).toBe(true);
    expect(stored.has(`${base}data/library.json`)).toBe(true);
    expect(stored.has(`${base}assets/main.js`)).toBe(true);
  });

  it("refreshes both datasets from network and falls back to cached data offline", async () => {
    const { handlers, stored, fetch } = harness();
    for (const filename of ["cards.json", "library.json"]) {
      const url = `${base}data/${filename}`;
      stored.set(url, new Response("old"));
      let response;
      const event = { request: { method: "GET", url, mode: "cors" }, respondWith: (promise) => response = promise };
      handlers.get("fetch")(event);
      expect(await (await response).text()).toBe("fresh");
      expect(await stored.get(url).clone().text()).toBe("fresh");
      fetch.mockRejectedValueOnce(new TypeError("offline"));
      handlers.get("fetch")(event);
      expect(await (await response).text()).toBe("fresh");
    }
  });
});
