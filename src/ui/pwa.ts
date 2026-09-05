/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

let reloadingForUpdate = false;

export function registerPwa(): void {
  setupConnectivityNotice();

  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    const baseUrl = import.meta.env.BASE_URL;
    const workerUrl = `${baseUrl}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`;

    void navigator.serviceWorker
      .register(workerUrl, { scope: baseUrl })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateNotice(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateNotice(worker);
            }
          });
        });

        window.addEventListener("online", () => void registration.update());
        window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        showTransientNotice("オフライン機能を開始できませんでした。通常の閲覧は続けられます。", "warning");
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}

function showUpdateNotice(worker: ServiceWorker): void {
  const region = noticeRegion();
  if (region.querySelector('[data-notice="update"]')) return;

  const notice = document.createElement("div");
  notice.className = "app-notice";
  notice.dataset.notice = "update";
  notice.setAttribute("role", "status");
  notice.innerHTML = `
    <span>新しい問題データまたはアプリ更新があります。</span>
    <span class="notice-actions">
      <button class="notice-button primary" type="button" data-update>更新する</button>
      <button class="notice-button" type="button" data-dismiss>あとで</button>
    </span>
  `;
  notice.querySelector("[data-update]")?.addEventListener("click", () => {
    worker.postMessage({ type: "SKIP_WAITING" });
  });
  notice.querySelector("[data-dismiss]")?.addEventListener("click", () => notice.remove());
  region.append(notice);
}

function setupConnectivityNotice(): void {
  const update = (): void => {
    const region = noticeRegion();
    const existing = region.querySelector<HTMLElement>('[data-notice="offline"]');

    if (navigator.onLine) {
      existing?.remove();
      return;
    }

    if (existing) return;
    const notice = document.createElement("div");
    notice.className = "app-notice offline";
    notice.dataset.notice = "offline";
    notice.setAttribute("role", "status");
    notice.textContent = "オフラインです。保存済みの問題で復習できます。";
    region.append(notice);
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function showTransientNotice(message: string, tone: "warning"): void {
  const notice = document.createElement("div");
  notice.className = `app-notice ${tone}`;
  notice.setAttribute("role", "status");
  notice.textContent = message;
  noticeRegion().append(notice);
  window.setTimeout(() => notice.remove(), 8000);
}

function noticeRegion(): HTMLElement {
  const existing = document.querySelector<HTMLElement>("#app-notices");
  if (existing) return existing;

  const region = document.createElement("div");
  region.id = "app-notices";
  region.className = "notice-region";
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  return region;
}
