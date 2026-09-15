import { describe, expect, it } from "vitest";
import { filterGlossary, filterStudyCards, relatedTerms, termCollections } from "../src/lib/library";
import type { GlossaryTerm, StudyCard } from "../src/types";

const baseCard: StudyCard = {
  id: "ED-0001", collectionId: "tam", addedAt: "2026-09-15", source: ["TAM"],
  difficulty: "Medium", theme: "連絡", promptJa: "確認後に連絡します。",
  answerEn: "I will call you after checking.", phrases: ["call you"], points: ["after + ing"],
  reviewStatus: "review", lastReviewedAt: null, attempts: 0, answerProvenance: "accepted",
};
const cards: StudyCard[] = [
  baseCard,
  { ...baseCard, id: "TD-0001", collectionId: "toeic-daily", source: ["TOEIC"],
    difficulty: null, theme: "日常", promptJa: "会議の前に電話をかけます。",
    answerEn: "I will make a phone call before the meeting.", phrases: ["make a phone call"], reviewStatus: null },
];
const terms: GlossaryTerm[] = [
  { id: "TERM-0001", expression: "make a phone call", meaningJa: "電話をかける",
    exampleEn: "I need to make a phone call.", pointJa: "make と組み合わせる。", tags: ["連絡", "慣用表現"],
    cardIds: ["TD-0001", "ED-0001"] },
  { id: "TERM-0002", expression: "business day", meaningJa: "営業日", exampleEn: "We will reply in two business days.",
    pointJa: "休日を除く日数。", tags: ["日程"], cardIds: ["TD-0001"] },
];

describe("collection separation", () => {
  it("scopes every search and filter to the selected collection", () => {
    expect(filterStudyCards(cards, "tam").map((card) => card.id)).toEqual(["ED-0001"]);
    expect(filterStudyCards(cards, "tam", { query: "make a phone call" })).toEqual([]);
    expect(filterStudyCards(cards, "toeic-daily", { status: "all", query: "PHONE CALL" })).toEqual([cards[1]]);
    expect(filterStudyCards(cards, "toeic-daily", { status: "review" })).toEqual([]);
    expect(filterStudyCards(cards, "toeic-daily", { difficulty: null, source: "TOEIC", theme: "日常" })).toEqual([cards[1]]);
  });

  it("preserves the original cards and review status", () => {
    const snapshot = structuredClone(cards);
    filterStudyCards(cards, "toeic-daily");
    filterStudyCards(cards, "tam", { status: "review" });
    expect(cards).toEqual(snapshot);
    expect(filterStudyCards(cards, "tam", { status: "review" })[0]).toBe(baseCard);
  });
});

describe("shared glossary", () => {
  it("searches expressions, Japanese, examples, points and tags with normalization", () => {
    expect(filterGlossary(terms, "ＭＡＫＥ　Ａ　ＰＨＯＮＥ　ＣＡＬＬ")).toEqual([terms[0]]);
    expect(filterGlossary(terms, "電話")).toEqual([terms[0]]);
    expect(filterGlossary(terms, "two business days")).toEqual([terms[1]]);
    expect(filterGlossary(terms, "休日")).toEqual([terms[1]]);
    expect(filterGlossary(terms, "慣用表現")).toEqual([terms[0]]);
    expect(filterGlossary(terms, "", "日程")).toEqual([terms[1]]);
    expect(filterGlossary(terms, "電話", "日程")).toEqual([]);
  });

  it("keeps one term shared by cards from both collections", () => {
    expect(relatedTerms(terms, "ED-0001")).toEqual([terms[0]]);
    expect(relatedTerms(terms, "TD-0001")).toEqual(terms);
    expect(relatedTerms(terms, "unknown")).toEqual([]);
    expect(termCollections(terms[0], cards)).toEqual(["tam", "toeic-daily"]);
    expect(termCollections(terms[1], cards)).toEqual(["toeic-daily"]);
    expect(termCollections({ ...terms[0], cardIds: ["unknown"] }, cards)).toEqual([]);
  });
});
