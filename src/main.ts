/// <reference types="vite/client" />

import "./styles.css";
import type { CardsDocument, DrillCard } from "./types";
import { mountApp, renderFatalError } from "./ui/app";
import { registerPwa } from "./ui/pwa";

const root = document.querySelector<HTMLElement>("#app");
const DOCUMENT_KEYS = ["schemaVersion", "generatedAt", "cards"] as const;
const CARD_KEYS = [
  "id",
  "addedAt",
  "source",
  "difficulty",
  "theme",
  "promptJa",
  "answerEn",
  "phrases",
  "points",
  "reviewStatus",
  "lastReviewedAt",
  "attempts",
  "answerProvenance",
] as const;

if (!root) {
  throw new Error("App root was not found.");
}

void bootstrap(root);
registerPwa();

async function bootstrap(container: HTMLElement): Promise<void> {
  try {
    const dataUrl = new URL(`${import.meta.env.BASE_URL}data/cards.json`, window.location.origin);
    const response = await fetch(dataUrl, { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`問題データを取得できませんでした（HTTP ${response.status}）。`);
    }

    const payload: unknown = await response.json();
    const document = parseCardsDocument(payload);
    mountApp(container, document.cards, document.generatedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    renderFatalError(container, message);
  }
}

function parseCardsDocument(payload: unknown): CardsDocument {
  // Raw arrays are accepted so locally authored fixtures remain easy to preview.
  const document: unknown = Array.isArray(payload)
    ? { schemaVersion: 1, generatedAt: new Date(0).toISOString(), cards: payload }
    : payload;

  if (!isRecord(document) || !hasExactKeys(document, DOCUMENT_KEYS)) {
    throw new Error("問題データの形式が正しくありません。");
  }

  const { schemaVersion, generatedAt, cards } = document;
  if (
    schemaVersion !== 1 ||
    typeof generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(generatedAt) ||
    Number.isNaN(Date.parse(generatedAt)) ||
    !Array.isArray(cards) ||
    cards.length === 0
  ) {
    throw new Error("未対応の問題データです。同期処理を再実行してください。");
  }

  if (!cards.every(isDrillCard)) {
    throw new Error("問題データに必須項目の欠落または不正な値があります。");
  }

  const ids = new Set(cards.map((card) => card.id));
  if (ids.size !== cards.length) {
    throw new Error("問題データに重複したIDがあります。");
  }

  return document as unknown as CardsDocument;
}

function isDrillCard(value: unknown): value is DrillCard {
  if (!isRecord(value) || !hasExactKeys(value, CARD_KEYS)) return false;

  const difficultyValues = new Set(["Easy", "Medium", "Hard", null]);
  const reviewStatusValues = new Set(["review", "mastered", null]);
  const provenanceValues = new Set(["accepted", "assistant-model"]);

  return (
    typeof value.id === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value.id) &&
    isValidDate(value.addedAt) &&
    isStringArray(value.source, 1) &&
    difficultyValues.has(value.difficulty as never) &&
    typeof value.theme === "string" &&
    value.theme.trim().length > 0 &&
    typeof value.promptJa === "string" &&
    value.promptJa.trim().length > 0 &&
    typeof value.answerEn === "string" &&
    value.answerEn.trim().length > 0 &&
    isStringArray(value.phrases, 1) &&
    isStringArray(value.points, 1, 3) &&
    reviewStatusValues.has(value.reviewStatus as never) &&
    (value.lastReviewedAt === null || isValidDate(value.lastReviewedAt)) &&
    typeof value.attempts === "number" &&
    Number.isSafeInteger(value.attempts) &&
    value.attempts >= 0 &&
    provenanceValues.has(value.answerProvenance as never) &&
    (value.reviewStatus !== null || (value.lastReviewedAt === null && value.attempts === 0)) &&
    (value.reviewStatus !== "mastered" || (value.lastReviewedAt !== null && value.attempts >= 1))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
