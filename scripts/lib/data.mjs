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
];

const DOCUMENT_KEYS = ["schemaVersion", "generatedAt", "cards"];

export class DataValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "DataValidationError";
    this.issues = issues;
  }
}

function normalizeComparable(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeDuplicate(value) {
  return normalizeComparable(value).replace(/[\s.!?…。！？]+$/gu, "");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === [...expectedKeys].sort()[index]);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validStringArray(value, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

export function findDuplicateCards(cards) {
  const issues = [];
  const promptIds = new Map();
  const answerIds = new Map();

  for (const card of cards) {
    if (!isPlainObject(card)) continue;
    for (const [field, map, value] of [
      ["Japanese prompt", promptIds, card.promptJa],
      ["English answer", answerIds, card.answerEn],
    ]) {
      if (typeof value !== "string") continue;
      const normalized = normalizeDuplicate(value);
      const existing = map.get(normalized);
      if (existing) issues.push(`${field} duplicates cards “${existing}” and “${card.id}”.`);
      else map.set(normalized, card.id);
    }
  }

  return issues;
}

function publicTextFields(card) {
  return [
    ["id", card.id],
    ["theme", card.theme],
    ["promptJa", card.promptJa],
    ["answerEn", card.answerEn],
    ...((Array.isArray(card.source) ? card.source : []).map((value, index) => [`source[${index}]`, value])),
    ...((Array.isArray(card.phrases) ? card.phrases : []).map((value, index) => [`phrases[${index}]`, value])),
    ...((Array.isArray(card.points) ? card.points : []).map((value, index) => [`points[${index}]`, value])),
  ];
}

function containsIpv4(value) {
  const candidates = value.match(/(?:^|\D)(\d{1,3}(?:\.\d{1,3}){3})(?!\d)/gu) ?? [];
  return candidates.some((candidate) => {
    const address = candidate.match(/\d{1,3}(?:\.\d{1,3}){3}/u)?.[0];
    return address?.split(".").every((octet) => Number(octet) <= 255) ?? false;
  });
}

const SENSITIVE_PATTERNS = [
  ["email address", (value) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value)],
  ["URL", (value) => /(?:\b(?:https?|ftp):\/\/|\bwww\.)\S+/iu.test(value)],
  ["Oracle Cloud identifier", (value) => /\bocid1\.[a-z0-9._-]+\b/iu.test(value)],
  ["Oracle SR number", (value) => /\b[1-9]-\d{9,}\b/u.test(value)],
  ["IP address", containsIpv4],
  ["local filesystem path", (value) => /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\|file:\/\/)/iu.test(value)],
  [
    "thread or session identifier",
    (value) =>
      /\b(?:thread|chat)[-_ ]?id\s*[:=]/iu.test(value) ||
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu.test(value),
  ],
];

/** Returns locations and categories only; matched secret values are never echoed. */
export function scanSensitiveCards(cards) {
  const findings = [];
  for (const card of cards) {
    if (!isPlainObject(card)) continue;
    for (const [field, value] of publicTextFields(card)) {
      if (typeof value !== "string") continue;
      for (const [category, matches] of SENSITIVE_PATTERNS) {
        if (matches(value)) findings.push({ cardId: card.id, field, category });
      }
    }
  }
  return findings;
}

export function countCards(cards) {
  const review = cards.filter((card) => isPlainObject(card) && card.reviewStatus === "review").length;
  const mastered = cards.filter((card) => isPlainObject(card) && card.reviewStatus === "mastered").length;
  return { total: cards.length, review, mastered, regular: cards.length - review - mastered };
}

export function mergeReviewState(cards, reviews) {
  const byId = new Map(cards.map((card) => [card.id, { ...card }]));
  const issues = [];

  for (const review of reviews) {
    const card = byId.get(review.id);
    if (!card) {
      issues.push(`Review ID “${review.id}” does not exist in the master table.`);
      continue;
    }

    for (const [label, cardValue, reviewValue] of [
      ["added date", card.addedAt, review.addedAt],
      ["theme", card.theme, review.theme],
      ["Japanese prompt", card.promptJa, review.promptJa],
      ["English answer", card.answerEn, review.answerEn],
    ]) {
      if (normalizeComparable(cardValue) !== normalizeComparable(reviewValue)) {
        issues.push(`Review ID “${review.id}” has a ${label} mismatch with the master table.`);
      }
    }

    card.reviewStatus = review.status;
    card.lastReviewedAt = review.lastReviewedAt;
    card.attempts = review.attempts;
  }

  if (issues.length > 0) throw new DataValidationError("Review data could not be merged.", issues);
  return cards.map((card) => byId.get(card.id));
}

function validateCard(card, index) {
  const prefix = `cards[${index}]`;
  const issues = [];
  if (!isPlainObject(card)) return [`${prefix} must be an object.`];
  if (!hasExactKeys(card, CARD_KEYS)) issues.push(`${prefix} contains missing or unexpected fields.`);
  if (typeof card.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(card.id)) {
    issues.push(`${prefix}.id must be a stable, URL-safe identifier (2-64 characters).`);
  }
  if (!validDate(card.addedAt)) issues.push(`${prefix}.addedAt must be a real YYYY-MM-DD date.`);
  if (!validStringArray(card.source)) issues.push(`${prefix}.source must contain at least one non-empty string.`);
  if (!["Easy", "Medium", "Hard", null].includes(card.difficulty)) issues.push(`${prefix}.difficulty is invalid.`);
  if (typeof card.theme !== "string" || !card.theme.trim()) issues.push(`${prefix}.theme is required.`);
  if (typeof card.promptJa !== "string" || !card.promptJa.trim()) issues.push(`${prefix}.promptJa is required.`);
  if (typeof card.answerEn !== "string" || !card.answerEn.trim()) issues.push(`${prefix}.answerEn is required.`);
  if (!validStringArray(card.phrases)) issues.push(`${prefix}.phrases must contain at least one non-empty string.`);
  if (!validStringArray(card.points, { min: 1, max: 3 })) issues.push(`${prefix}.points must contain 1 to 3 strings.`);
  if (!["review", "mastered", null].includes(card.reviewStatus)) issues.push(`${prefix}.reviewStatus is invalid.`);
  if (card.lastReviewedAt !== null && !validDate(card.lastReviewedAt)) {
    issues.push(`${prefix}.lastReviewedAt must be null or a real YYYY-MM-DD date.`);
  }
  if (!Number.isSafeInteger(card.attempts) || card.attempts < 0) {
    issues.push(`${prefix}.attempts must be a non-negative integer.`);
  }
  if (!["accepted", "assistant-model"].includes(card.answerProvenance)) {
    issues.push(`${prefix}.answerProvenance is invalid.`);
  }
  if (card.reviewStatus === null && (card.lastReviewedAt !== null || card.attempts !== 0)) {
    issues.push(`${prefix} has review history but no review status.`);
  }
  if (card.reviewStatus === "mastered" && (card.lastReviewedAt === null || card.attempts < 1)) {
    issues.push(`${prefix} is mastered but has no completed review attempt.`);
  }
  return issues;
}

function validateExpectedCounts(cards, expected) {
  if (!expected) return [];
  const actual = countCards(cards);
  return Object.entries(expected)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) =>
      actual[key] === value ? [] : [`Expected ${key}=${value}, but found ${actual[key]}.`],
    );
}

export function validateCardsDocument(document, options = {}) {
  const issues = [];
  if (!isPlainObject(document)) return ["Cards document must be an object."];
  if (!hasExactKeys(document, DOCUMENT_KEYS)) issues.push("Cards document contains missing or unexpected fields.");
  if (document.schemaVersion !== 1) issues.push("schemaVersion must be 1.");
  if (
    typeof document.generatedAt !== "string" ||
    Number.isNaN(Date.parse(document.generatedAt)) ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(document.generatedAt)
  ) {
    issues.push("generatedAt must be an ISO 8601 timestamp.");
  }
  if (!Array.isArray(document.cards) || document.cards.length === 0) {
    issues.push("cards must be a non-empty array.");
    return issues;
  }

  document.cards.forEach((card, index) => issues.push(...validateCard(card, index)));
  const ids = new Set();
  for (const card of document.cards) {
    if (typeof card?.id !== "string") continue;
    if (ids.has(card.id)) issues.push(`Duplicate card ID “${card.id}”.`);
    ids.add(card.id);
  }
  issues.push(...findDuplicateCards(document.cards));
  issues.push(...validateExpectedCounts(document.cards, options.expectedCounts));

  if (options.scanSensitive !== false) {
    for (const finding of scanSensitiveCards(document.cards)) {
      issues.push(`Sensitive ${finding.category} detected in card “${finding.cardId}” field ${finding.field}.`);
    }
  }
  return issues;
}

export function assertValidCardsDocument(document, options = {}) {
  const issues = validateCardsDocument(document, options);
  if (issues.length > 0) throw new DataValidationError("Cards document validation failed.", issues);
  return document;
}

function parseOptionalCount(value, name) {
  if (value === undefined || value === "") return undefined;
  if (!/^\d+$/u.test(value)) throw new DataValidationError(`${name} must be a non-negative integer.`);
  return Number.parseInt(value, 10);
}

export function expectedCountsFromEnvironment(environment = process.env) {
  const expected = {
    total: parseOptionalCount(environment.DRILL_EXPECTED_TOTAL, "DRILL_EXPECTED_TOTAL"),
    review: parseOptionalCount(environment.DRILL_EXPECTED_REVIEW, "DRILL_EXPECTED_REVIEW"),
    mastered: parseOptionalCount(environment.DRILL_EXPECTED_MASTERED, "DRILL_EXPECTED_MASTERED"),
    regular: parseOptionalCount(environment.DRILL_EXPECTED_REGULAR, "DRILL_EXPECTED_REGULAR"),
  };
  return Object.values(expected).some((value) => value !== undefined) ? expected : undefined;
}
