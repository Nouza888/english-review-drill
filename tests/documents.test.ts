import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCardsDocument, parseStudyLibrary } from "../src/lib/documents";
import type { GlossaryTerm } from "../src/types";

const tam = JSON.parse(readFileSync(new URL("../public/data/cards.json", import.meta.url), "utf8"));
const term: GlossaryTerm = {
  id: "TERM-0001",
  expression: "make a phone call",
  meaningJa: "電話をかける",
  exampleEn: "I need to make a phone call.",
  pointJa: "電話をかけるは make a phone call。",
  tags: ["日常"],
  cardIds: ["TD-0001"],
};
function library() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-15T00:00:00.000Z",
    cards: [{ ...tam.cards[0], id: "TD-0001", reviewStatus: null, lastReviewedAt: null, attempts: 0 }],
    terms: [structuredClone(term)],
  };
}

describe("browser library parser", () => {
  it("keeps original TAM cards and statuses unchanged while attaching collection IDs", () => {
    const before = structuredClone(tam);
    const result = parseStudyLibrary(tam, library());
    expect(tam).toEqual(before);
    expect(result.cards.filter((card) => card.collectionId === "tam")).toHaveLength(tam.cards.length);
    expect(result.cards[0]).toEqual({ ...tam.cards[0], collectionId: "tam" });
    expect(result.cards.at(-1)).toMatchObject({ collectionId: "toeic-daily", reviewStatus: null, attempts: 0 });
    expect(result.terms).toEqual([term]);
  });

  it("rejects card ID collisions between collections", () => {
    const payload = library();
    payload.cards[0].id = tam.cards[0].id;
    expect(() => parseStudyLibrary(tam, payload)).toThrow("教材間");
  });

  it("rejects missing supplemental fields, duplicate glossary expressions and orphan references", () => {
    const payload = library();
    expect(() => parseStudyLibrary(tam, { cards: payload.cards })).toThrow("追加教材");
    payload.terms.push({ ...term, id: "TERM-0002", expression: " MAKE  A PHONE CALL " });
    expect(() => parseStudyLibrary(tam, payload)).toThrow("重複");
    const orphan = library();
    orphan.terms[0].cardIds = ["missing-card"];
    expect(() => parseStudyLibrary(tam, orphan)).toThrow("関連問題");
  });

  it("rejects invalid terms and unexpected fields before rendering", () => {
    const payload = library();
    payload.terms[0].exampleEn = "";
    expect(() => parseStudyLibrary(tam, payload)).toThrow("用語集");
    expect(() => parseStudyLibrary(tam, { ...library(), privateNotes: "not public" })).toThrow("追加教材");
    expect(() => parseCardsDocument({ ...tam, schemaVersion: 2 })).toThrow();
  });
});
