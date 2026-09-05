const MASTER_COLUMNS = {
  id: ["id"],
  addedAt: ["added", "addedat", "追加日"],
  source: ["source", "sources", "出典"],
  difficulty: ["difficulty", "難易度"],
  theme: ["theme", "テーマ"],
  promptJa: ["japaneseprompt", "promptja", "日本語問題", "日本語問題文"],
  answerEn: ["finalenglish", "answeren", "englishanswer", "模範解答"],
  phrases: ["reusablephrases", "reusablephrase", "phrases", "再利用表現"],
  points: ["points", "point", "重要ポイント"],
  answerProvenance: ["answerprovenance", "provenance", "回答出典"],
};

const REVIEW_COLUMNS = {
  id: ["id"],
  status: ["status", "状態"],
  addedAt: ["added", "addedat", "追加日"],
  theme: ["theme", "テーマ"],
  promptJa: ["japaneseprompt", "promptja", "日本語問題", "日本語問題文"],
  answerEn: ["finalenglish", "answeren", "englishanswer", "模範解答"],
  phrases: ["reusablephrase", "reusablephrases", "phrases", "再利用表現"],
  lastReviewedAt: ["lastreview", "lastreviewedat", "最終復習日"],
  attempts: ["attempts", "試行回数"],
};

export class DataFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "DataFormatError";
  }
}

function normalizeHeader(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s_\-・/]+/gu, "").trim();
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;

  const cells = [];
  let cell = "";
  let escaped = false;
  let codeDelimiterLength = 0;

  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      let length = 1;
      while (trimmed[index + length] === "`") length += 1;
      if (codeDelimiterLength === 0) codeDelimiterLength = length;
      else if (codeDelimiterLength === length) codeDelimiterLength = 0;
      cell += "`".repeat(length);
      index += length - 1;
      continue;
    }
    if (character === "|" && codeDelimiterLength === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }

  if (escaped) cell += "\\";
  if (cell.trim()) cells.push(cell.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s/gu, "")));
}

export function parseMarkdownTables(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Markdown input must be a string.");
  const lines = markdown.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  const tables = [];

  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    const headers = splitMarkdownRow(lines[lineIndex]);
    const separator = splitMarkdownRow(lines[lineIndex + 1]);
    if (!headers || !separator || headers.length !== separator.length || !isSeparatorRow(separator)) {
      continue;
    }

    const rows = [];
    let rowIndex = lineIndex + 2;
    for (; rowIndex < lines.length; rowIndex += 1) {
      const cells = splitMarkdownRow(lines[rowIndex]);
      if (!cells) break;
      if (cells.length !== headers.length) {
        throw new DataFormatError(
          `Malformed Markdown table row at line ${rowIndex + 1}: expected ${headers.length} cells, found ${cells.length}.`,
        );
      }
      rows.push({ cells, line: rowIndex + 1 });
    }

    tables.push({ headers, rows, line: lineIndex + 1 });
    lineIndex = rowIndex - 1;
  }

  return tables;
}

function resolveColumns(table, aliases, label) {
  const normalizedHeaders = table.headers.map(normalizeHeader);
  const resolved = {};

  for (const [field, acceptedHeaders] of Object.entries(aliases)) {
    const accepted = acceptedHeaders.map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) => accepted.includes(header));
    if (index < 0) {
      throw new DataFormatError(
        `${label} table at line ${table.line} is missing the required “${acceptedHeaders[0]}” column.`,
      );
    }
    resolved[field] = index;
  }

  return resolved;
}

function findTable(markdown, aliases, label) {
  const tables = parseMarkdownTables(markdown);
  const requiredHeaders = Object.values(aliases).map((values) => values.map(normalizeHeader));
  const table = tables.find(({ headers }) => {
    const normalized = headers.map(normalizeHeader);
    return requiredHeaders.every((choices) => choices.some((choice) => normalized.includes(choice)));
  });

  if (!table) {
    throw new DataFormatError(`Could not find the ${label} table with all required columns.`);
  }
  if (table.rows.length === 0) throw new DataFormatError(`${label} table contains no data rows.`);
  return table;
}

function cell(row, columns, field) {
  return row.cells[columns[field]].trim();
}

function requireText(value, field, line) {
  if (!value) throw new DataFormatError(`Missing ${field} at Markdown line ${line}.`);
  return value;
}

function parseDate(value, field, line, nullable = false) {
  const cleaned = value.trim();
  if (nullable && (!cleaned || /^[—–-]$/u.test(cleaned))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(cleaned)) {
    throw new DataFormatError(`Invalid ${field} at Markdown line ${line}; expected YYYY-MM-DD.`);
  }
  const parsed = new Date(`${cleaned}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== cleaned) {
    throw new DataFormatError(`Invalid ${field} at Markdown line ${line}; date does not exist.`);
  }
  return cleaned;
}

function parseMultiValue(value) {
  return value
    .split(/<br\s*\/?\s*>/giu)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDifficulty(value, line) {
  const cleaned = value.trim();
  if (!cleaned || /^[—–-]$/u.test(cleaned)) return null;
  const normalized = cleaned.toLocaleLowerCase();
  const match = ["Easy", "Medium", "Hard"].find((item) => item.toLocaleLowerCase() === normalized);
  if (!match) throw new DataFormatError(`Invalid difficulty at Markdown line ${line}.`);
  return match;
}

function parseProvenance(value, line) {
  const cleaned = value.trim().toLocaleLowerCase();
  if (cleaned !== "accepted" && cleaned !== "assistant-model") {
    throw new DataFormatError(`Invalid answer provenance at Markdown line ${line}.`);
  }
  return cleaned;
}

function parseStatus(value, line) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  if (normalized === "review" || normalized === "⭐ 要復習" || normalized === "要復習") return "review";
  if (normalized === "mastered" || normalized === "✅ 定着" || normalized === "定着") return "mastered";
  throw new DataFormatError(`Invalid review status at Markdown line ${line}.`);
}

function parseAttempts(value, line) {
  if (!/^\d+$/u.test(value.trim())) {
    throw new DataFormatError(`Invalid attempts at Markdown line ${line}; expected a non-negative integer.`);
  }
  return Number.parseInt(value, 10);
}

function assertUniqueIds(records, label) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) throw new DataFormatError(`Duplicate ID “${record.id}” in the ${label} table.`);
    seen.add(record.id);
  }
}

export function parseMasterMarkdown(markdown) {
  const table = findTable(markdown, MASTER_COLUMNS, "master");
  const columns = resolveColumns(table, MASTER_COLUMNS, "master");
  const cards = table.rows.map((row) => {
    const phrases = parseMultiValue(cell(row, columns, "phrases"));
    const points = parseMultiValue(cell(row, columns, "points"));
    const source = parseMultiValue(cell(row, columns, "source"));
    if (source.length === 0) throw new DataFormatError(`Missing source at Markdown line ${row.line}.`);
    if (phrases.length === 0) throw new DataFormatError(`Missing reusable phrase at Markdown line ${row.line}.`);
    if (points.length < 1 || points.length > 3) {
      throw new DataFormatError(`Points must contain 1 to 3 items at Markdown line ${row.line}.`);
    }

    return {
      id: requireText(cell(row, columns, "id"), "ID", row.line),
      addedAt: parseDate(cell(row, columns, "addedAt"), "added date", row.line),
      source,
      difficulty: parseDifficulty(cell(row, columns, "difficulty"), row.line),
      theme: requireText(cell(row, columns, "theme"), "theme", row.line),
      promptJa: requireText(cell(row, columns, "promptJa"), "Japanese prompt", row.line),
      answerEn: requireText(cell(row, columns, "answerEn"), "English answer", row.line),
      phrases,
      points,
      reviewStatus: null,
      lastReviewedAt: null,
      attempts: 0,
      answerProvenance: parseProvenance(cell(row, columns, "answerProvenance"), row.line),
    };
  });
  assertUniqueIds(cards, "master");
  return cards;
}

export function parseReviewMarkdown(markdown) {
  const table = findTable(markdown, REVIEW_COLUMNS, "review");
  const columns = resolveColumns(table, REVIEW_COLUMNS, "review");
  const reviews = table.rows.map((row) => ({
    id: requireText(cell(row, columns, "id"), "ID", row.line),
    status: parseStatus(cell(row, columns, "status"), row.line),
    addedAt: parseDate(cell(row, columns, "addedAt"), "added date", row.line),
    theme: requireText(cell(row, columns, "theme"), "theme", row.line),
    promptJa: requireText(cell(row, columns, "promptJa"), "Japanese prompt", row.line),
    answerEn: requireText(cell(row, columns, "answerEn"), "English answer", row.line),
    phrases: parseMultiValue(cell(row, columns, "phrases")),
    lastReviewedAt: parseDate(cell(row, columns, "lastReviewedAt"), "last review date", row.line, true),
    attempts: parseAttempts(cell(row, columns, "attempts"), row.line),
  }));
  assertUniqueIds(reviews, "review");
  return reviews;
}
