import type { CardFilters, GlossaryTerm, StudyCard } from "../types";
import { filterCards } from "./cards";

export type CollectionId = StudyCard["collectionId"];

export const COLLECTION_LABELS: Record<CollectionId, string> = {
  tam: "TAM業務",
  "toeic-daily": "TOEIC S&W・日常英語",
};

export function filterStudyCards(
  cards: readonly StudyCard[],
  collectionId: CollectionId,
  filters: CardFilters = {},
): StudyCard[] {
  const scoped = cards.filter((card) => card.collectionId === collectionId);
  const ids = new Set(filterCards(scoped, filters).map((card) => card.id));
  return scoped.filter((card) => ids.has(card.id));
}

export function filterGlossary(
  terms: readonly GlossaryTerm[],
  query = "",
  tag?: string,
): GlossaryTerm[] {
  const normalizedQuery = normalizeSearch(query);
  return terms.filter((term) => {
    if (tag && !term.tags.includes(tag)) return false;
    return !normalizedQuery || normalizeSearch([
      term.expression, term.meaningJa, term.exampleEn, term.pointJa, ...term.tags,
    ].join("\n")).includes(normalizedQuery);
  });
}

export function relatedTerms(terms: readonly GlossaryTerm[], cardId: string): GlossaryTerm[] {
  return terms.filter((term) => term.cardIds.includes(cardId));
}

export function termCollections(term: GlossaryTerm, cards: readonly StudyCard[]): CollectionId[] {
  const linkedIds = new Set(term.cardIds);
  const used = new Set(cards.filter((card) => linkedIds.has(card.id)).map((card) => card.collectionId));
  return (["tam", "toeic-daily"] as const).filter((collectionId) => used.has(collectionId));
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}
