export type ReviewStatus = "review" | "mastered" | null;

export type Difficulty = "Easy" | "Medium" | "Hard" | null;

export interface DrillCard {
  id: string;
  addedAt: string;
  source: string[];
  difficulty: Difficulty;
  theme: string;
  promptJa: string;
  answerEn: string;
  phrases: string[];
  points: string[];
  reviewStatus: ReviewStatus;
  lastReviewedAt: string | null;
  attempts: number;
  answerProvenance: "accepted" | "assistant-model";
}

export interface CardsDocument {
  schemaVersion: 1;
  generatedAt: string;
  cards: DrillCard[];
}

export type CollectionId = "tam" | "toeic-daily";

export interface StudyCard extends DrillCard {
  collectionId: CollectionId;
}

export interface GlossaryTerm {
  id: string;
  expression: string;
  meaningJa: string;
  exampleEn: string;
  pointJa: string;
  tags: string[];
  cardIds: string[];
}

export interface LibraryDocument extends CardsDocument {
  terms: GlossaryTerm[];
}

export type CardStatusFilter = ReviewStatus | "all" | "regular";

export interface CardFilters {
  query?: string;
  status?: CardStatusFilter;
  theme?: string;
  difficulty?: Difficulty | "all";
  source?: string;
}
