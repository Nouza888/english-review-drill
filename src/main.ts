/// <reference types="vite/client" />

import "./styles.css";
import { parseStudyLibrary } from "./lib/documents";
import { mountApp, renderFatalError } from "./ui/app";
import { registerPwa } from "./ui/pwa";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("App root was not found.");

void bootstrap(root);
registerPwa();

async function bootstrap(container: HTMLElement): Promise<void> {
  try {
    const [tam, supplemental] = await Promise.all([
      loadDocument("cards.json"),
      loadDocument("library.json"),
    ]);
    const library = parseStudyLibrary(tam, supplemental);
    mountApp(container, library.cards, library.generatedAt, library.terms);
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    renderFatalError(container, message);
  }
}

async function loadDocument(filename: string): Promise<unknown> {
  const url = new URL(`${import.meta.env.BASE_URL}data/${filename}`, window.location.origin);
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`教材データを取得できませんでした（HTTP ${response.status}）。`);
  return response.json();
}
