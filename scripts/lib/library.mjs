import { DataValidationError, scanSensitiveCards, validateCardsDocument } from "./data.mjs";
import { DataFormatError, parseMarkdownTables } from "./markdown.mjs";

const DOCUMENT_KEYS = ["schemaVersion", "generatedAt", "cards", "terms"];
const TERM_KEYS = ["id", "expression", "meaningJa", "exampleEn", "pointJa", "tags", "cardIds"];
const GLOSSARY_COLUMNS = ["ID", "Expression", "Meaning", "Example", "Point", "Tags", "Card IDs"];
const TEXT_FIELDS = ["id", "expression", "meaningJa", "exampleEn", "pointJa"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stableId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value);
}

function splitValues(value) {
  return value.split(/<br\s*\/?\s*>/giu).map((item) => item.trim()).filter(Boolean);
}

function normalizeExpression(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().replace(/[\s.!?…。！？]+$/gu, "");
}

/** Reuse the public-data scanner while never returning a source value or identifier. */
function sensitiveCategories(value) {
  if (typeof value !== "string") return [];
  return scanSensitiveCards([{ id: "scan-item", points: [value] }]).map(({ category }) => category);
}

/** There is one canonical table; prose outside it is not published. */
export function parseGlossaryMarkdown(markdown) {
  const matching = parseMarkdownTables(markdown).filter(({ headers }) =>
    headers.length === GLOSSARY_COLUMNS.length && headers.every((header, index) => header === GLOSSARY_COLUMNS[index]),
  );
  if (matching.length !== 1) {
    throw new DataFormatError("Expected exactly one glossary table with columns ID, Expression, Meaning, Example, Point, Tags, Card IDs.");
  }
  if (matching[0].rows.length === 0) throw new DataFormatError("Glossary table contains no data rows.");
  return matching[0].rows.map(({ cells, line }) => {
    if (cells.some((value) => !value.trim())) throw new DataFormatError(`Missing glossary value at Markdown line ${line}.`);
    return {
      id: cells[0], expression: cells[1], meaningJa: cells[2], exampleEn: cells[3], pointJa: cells[4],
      tags: splitValues(cells[5]), cardIds: splitValues(cells[6]),
    };
  });
}

/** New cards are validated independently; a model sentence may also occur in TAM. */
export function validateLibraryDocument(document, legacyCards = []) {
  if (!isObject(document)) return ["Library document must be an object."];
  const issues = [];
  if (!exactKeys(document, DOCUMENT_KEYS)) issues.push("Library document contains missing or unexpected fields.");

  // Existing card diagnostics include IDs. Replace an unsafe ID before reusing them,
  // and report the invalid field by position so source values cannot leak via errors.
  const safeCards = Array.isArray(document.cards) ? document.cards.map((card, index) => {
    if (!isObject(card)) return card;
    const categories = sensitiveCategories(card.id);
    if (!stableId(card.id) || categories.length > 0) {
      issues.push(`cards[${index}].id must be a non-sensitive, stable, URL-safe identifier (2-64 characters).`);
      return { ...card, id: `invalid-card-${index}` };
    }
    return card;
  }) : document.cards;
  issues.push(...validateCardsDocument({
    schemaVersion: document.schemaVersion, generatedAt: document.generatedAt, cards: safeCards,
  }));

  const knownCardIds = new Set(legacyCards.filter(isObject).map((card) => card.id));
  if (Array.isArray(document.cards)) {
    document.cards.forEach((card, index) => {
      if (!isObject(card) || typeof card.id !== "string") return;
      if (knownCardIds.has(card.id)) issues.push(`cards[${index}].id collides with an existing card ID.`);
    });
    for (const card of document.cards) if (isObject(card) && stableId(card.id)) knownCardIds.add(card.id);
  }

  if (!Array.isArray(document.terms) || document.terms.length === 0) {
    issues.push("terms must be a non-empty array.");
    return issues;
  }

  const termIds = new Set();
  const expressions = new Set();
  document.terms.forEach((term, index) => {
    const prefix = `terms[${index}]`;
    if (!isObject(term)) { issues.push(`${prefix} must be an object.`); return; }
    if (!exactKeys(term, TERM_KEYS)) issues.push(`${prefix} contains missing or unexpected fields.`);
    for (const field of TEXT_FIELDS) {
      if (!nonEmptyString(term[field])) issues.push(`${prefix}.${field} is required.`);
    }
    if (!stableId(term.id)) issues.push(`${prefix}.id must be a stable, URL-safe identifier (2-64 characters).`);
    if (typeof term.id === "string") {
      if (termIds.has(term.id)) issues.push(`${prefix}.id duplicates another glossary ID.`);
      termIds.add(term.id);
    }
    if (nonEmptyString(term.expression)) {
      const normalized = normalizeExpression(term.expression);
      if (expressions.has(normalized)) issues.push(`${prefix}.expression duplicates another glossary expression.`);
      expressions.add(normalized);
    }
    for (const field of ["tags", "cardIds"]) {
      if (!Array.isArray(term[field]) || term[field].length === 0 || !term[field].every(nonEmptyString)) {
        issues.push(`${prefix}.${field} must contain at least one non-empty string.`);
      } else if (new Set(term[field]).size !== term[field].length) {
        issues.push(`${prefix}.${field} contains duplicate values.`);
      }
    }
    if (Array.isArray(term.cardIds)) {
      term.cardIds.forEach((id, linkIndex) => {
        if (!stableId(id) || !knownCardIds.has(id)) issues.push(`${prefix}.cardIds[${linkIndex}] must reference an existing card.`);
      });
    }
    const fields = [
      ...TEXT_FIELDS.map((field) => [field, term[field]]),
      ...["tags", "cardIds"].flatMap((field) => Array.isArray(term[field])
        ? term[field].map((value, itemIndex) => [`${field}[${itemIndex}]`, value]) : []),
    ];
    for (const [field, value] of fields) {
      for (const category of sensitiveCategories(value)) issues.push(`Sensitive ${category} detected in ${prefix}.${field}.`);
    }
  });
  return issues;
}

export function assertValidLibraryDocument(document, legacyCards = []) {
  const issues = validateLibraryDocument(document, legacyCards);
  if (issues.length > 0) throw new DataValidationError("Library document validation failed.", issues);
  return document;
}
