import type { CardsDocument, DrillCard, GlossaryTerm, StudyCard } from "../types";

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

export function parseCardsDocument(payload: unknown): CardsDocument {
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

const TERM_KEYS = ["id", "expression", "meaningJa", "exampleEn", "pointJa", "tags", "cardIds"] as const;

export function parseStudyLibrary(tamPayload: unknown, libraryPayload: unknown): {
  cards: StudyCard[];
  terms: GlossaryTerm[];
  generatedAt: string;
} {
  const tam = parseCardsDocument(tamPayload);
  if (!isRecord(libraryPayload) || !hasExactKeys(libraryPayload, [...DOCUMENT_KEYS, "terms"])) {
    throw new Error("追加教材の形式が正しくありません。");
  }
  const toeic = parseCardsDocument({
    schemaVersion: libraryPayload.schemaVersion,
    generatedAt: libraryPayload.generatedAt,
    cards: libraryPayload.cards,
  });
  const cards: StudyCard[] = [
    ...tam.cards.map((card): StudyCard => ({ ...card, collectionId: "tam" })),
    ...toeic.cards.map((card): StudyCard => ({ ...card, collectionId: "toeic-daily" })),
  ];
  const cardIds = new Set(cards.map((card) => card.id));
  if (cardIds.size !== cards.length) throw new Error("教材間で問題IDが重複しています。");

  const terms = libraryPayload.terms;
  if (!Array.isArray(terms) || terms.length === 0 || !terms.every(isGlossaryTerm)) {
    throw new Error("用語集に必須項目の欠落または不正な値があります。");
  }
  const termIds = new Set(terms.map((term) => term.id));
  const expressions = new Set(terms.map((term) => term.expression.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()));
  if (termIds.size !== terms.length || expressions.size !== terms.length) {
    throw new Error("用語集に重複したIDまたは表現があります。");
  }
  if (terms.some((term) => term.cardIds.some((id) => !cardIds.has(id)))) {
    throw new Error("用語集の関連問題が見つかりません。");
  }
  return {
    cards,
    terms,
    generatedAt: Date.parse(tam.generatedAt) > Date.parse(toeic.generatedAt) ? tam.generatedAt : toeic.generatedAt,
  };
}

function isGlossaryTerm(value: unknown): value is GlossaryTerm {
  if (!isRecord(value) || !hasExactKeys(value, TERM_KEYS)) return false;
  return (
    typeof value.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value.id) &&
    ["expression", "meaningJa", "exampleEn", "pointJa"].every((key) => typeof value[key] === "string" && value[key].trim().length > 0) &&
    isStringArray(value.tags, 1) && new Set(value.tags).size === value.tags.length &&
    isStringArray(value.cardIds, 1) && new Set(value.cardIds).size === value.cardIds.length
  );
}
