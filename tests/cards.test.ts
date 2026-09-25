import { describe, expect, it } from "vitest";
import { createDrillQueue, createShuffledQueue, filterCards } from "../src/lib/cards";
import type { DrillCard } from "../src/types";

const baseCard: DrillCard = {
  id: "drill-001",
  addedAt: "2026-07-17",
  source: ["study-chat-1"],
  difficulty: "Medium",
  theme: "TAM・顧客説明",
  promptJa: "確認済みの事実として伝えないでください。",
  answerEn: "Please don't present it as a confirmed fact.",
  phrases: ["present A as B"],
  points: ["present A as B の語順を保つ。"],
  reviewStatus: "review",
  lastReviewedAt: null,
  attempts: 0,
  answerProvenance: "accepted",
};

const cards: DrillCard[] = [
  baseCard,
  {
    ...baseCard,
    id: "drill-002",
    source: ["study-chat-2"],
    difficulty: "Easy",
    theme: "Small talk",
    promptJa: "今日は家でのんびりします。",
    answerEn: "I'm going to take it easy at home.",
    phrases: ["take it easy"],
    reviewStatus: null,
  },
  {
    ...baseCard,
    id: "drill-003",
    difficulty: null,
    theme: "期限調整",
    promptJa: "今日中の完了は現実的ではありません。",
    answerEn: "It is not feasible by the end of today.",
    phrases: ["by the end of today"],
    reviewStatus: "mastered",
    lastReviewedAt: "2026-09-02",
    attempts: 1,
  },
];

describe("filterCards", () => {
  it("searches Japanese, English, and reusable phrases using normalized case", () => {
    expect(filterCards(cards, { query: "確認済み" }).map(({ id }) => id)).toEqual(["drill-001"]);
    expect(filterCards(cards, { query: "TAKE IT EASY" }).map(({ id }) => id)).toEqual(["drill-002"]);
    expect(filterCards(cards, { query: "present a as b" }).map(({ id }) => id)).toEqual(["drill-001"]);
  });

  it("combines status, theme, difficulty, and source filters", () => {
    expect(
      filterCards(cards, {
        status: "review",
        theme: "TAM・顧客説明",
        difficulty: "Medium",
        source: "study-chat-1",
      }).map(({ id }) => id),
    ).toEqual(["drill-001"]);
    expect(filterCards(cards, { status: "regular" }).map(({ id }) => id)).toEqual(["drill-002"]);
    expect(filterCards(cards, { difficulty: null }).map(({ id }) => id)).toEqual(["drill-003"]);
    expect(filterCards(cards, { query: "存在しない語" })).toEqual([]);
  });
});

describe("createShuffledQueue", () => {
  it("returns a shuffled copy without mutating the source", () => {
    const source = ["a", "b", "c", "d"];
    const samples = [0.25, 0.5, 0];
    const shuffled = createShuffledQueue(source, () => samples.shift() ?? 0);
    expect(source).toEqual(["a", "b", "c", "d"]);
    expect(shuffled).toHaveLength(source.length);
    expect([...shuffled].sort()).toEqual(source);
    expect(shuffled).not.toEqual(source);
  });

  it("rejects an invalid random source", () => {
    expect(() => createShuffledQueue([1, 2], () => 1)).toThrow(RangeError);
  });
});

describe("createDrillQueue", () => {
  it("keeps source order after filtering and at the start of the next listed round", () => {
    const ids = filterCards(cards, { source: "study-chat-1" }).map(({ id }) => id);
    expect(ids).toEqual(["drill-001", "drill-003"]);
    const firstRound = createDrillQueue(ids, "listed");
    expect(firstRound).toEqual(ids);
    expect(firstRound).not.toBe(ids);
    expect(createDrillQueue(ids, "listed", "drill-003")).toEqual(ids);
    // An individually opened card must not change the next round's source order.
    expect(createDrillQueue(ids, "listed", "drill-001")).toEqual(ids);
  });

  it("avoids repeating the previous card at the start of a random round", () => {
    const ids = ["a", "b", "c"];
    const nextRound = createDrillQueue(ids, "random", "a", () => 0.99);
    expect(nextRound[0]).not.toBe("a");
    expect([...nextRound].sort()).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("handles empty and single-card pools in both orders", () => {
    for (const order of ["listed", "random"] as const) {
      expect(createDrillQueue([], order)).toEqual([]);
      expect(createDrillQueue(["only"], order, "only")).toEqual(["only"]);
    }
  });
});
