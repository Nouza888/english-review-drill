import type { CardFilters, DrillCard } from "../types";

export type DrillOrder = "listed" | "random";

function normalizeSearchValue(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

/**
 * Applies every active list/drill filter. Search intentionally covers only the
 * Japanese prompt, English answer, and reusable phrases shown in the product
 * requirement.
 */
export function filterCards(cards: readonly DrillCard[], filters: CardFilters = {}): DrillCard[] {
  const query = normalizeSearchValue(filters.query ?? "");
  const status = filters.status ?? "all";
  const difficulty = filters.difficulty === undefined ? "all" : filters.difficulty;

  return cards.filter((card) => {
    if (status === "regular" && card.reviewStatus !== null) return false;
    if (status !== "all" && status !== "regular" && card.reviewStatus !== status) return false;
    if (filters.theme && card.theme !== filters.theme) return false;
    if (difficulty !== "all" && card.difficulty !== difficulty) return false;
    if (filters.source && !card.source.includes(filters.source)) return false;

    if (query) {
      const searchable = [card.promptJa, card.answerEn, ...card.phrases]
        .map(normalizeSearchValue)
        .join("\n");
      if (!searchable.includes(query)) return false;
    }

    return true;
  });
}

/** Fisher-Yates shuffle. The input is never mutated. */
export function createShuffledQueue<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const queue = [...values];

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("random() must return a finite number in the range [0, 1).");
    }
    const swapIndex = Math.floor(sample * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }

  return queue;
}

/** Builds a fresh round from the source order, avoiding consecutive repeats only when shuffled. */
export function createDrillQueue<T>(
  values: readonly T[],
  order: DrillOrder,
  previous?: T | null,
  random: () => number = Math.random,
): T[] {
  if (order === "listed") return [...values];

  const queue = createShuffledQueue(values, random);
  if (queue.length > 1 && queue[0] === previous) {
    [queue[0], queue[1]] = [queue[1], queue[0]];
  }
  return queue;
}
