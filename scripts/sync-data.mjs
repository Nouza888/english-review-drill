import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertValidCardsDocument, countCards, expectedCountsFromEnvironment, mergeReviewState } from "./lib/data.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { parseMasterMarkdown, parseReviewMarkdown } from "./lib/markdown.mjs";

const OUTPUT_PATH = path.resolve("public/data/cards.json");

async function readRequiredInput(environment, name) {
  const configuredPath = environment[name]?.trim();
  if (!configuredPath) throw new Error(`${name} is required. Copy .env.example to .env and set both source paths.`);
  return readFile(path.resolve(configuredPath), "utf8");
}

function formatCounts(cards, reviewRows) {
  const counts = countCards(cards);
  return `${counts.total} total / ${counts.review} review / ${counts.mastered} mastered / ${counts.regular} regular / ${reviewRows} review rows`;
}

async function cardsAreUnchanged(cards) {
  try {
    const existing = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    assertValidCardsDocument(existing);
    return JSON.stringify(existing.cards) === JSON.stringify(cards);
  } catch {
    return false;
  }
}

export async function syncData(environment = process.env) {
  const [masterMarkdown, reviewMarkdown] = await Promise.all([
    readRequiredInput(environment, "DRILL_MASTER_PATH"),
    readRequiredInput(environment, "DRILL_REVIEW_PATH"),
  ]);
  const masterCards = parseMasterMarkdown(masterMarkdown);
  const reviews = parseReviewMarkdown(reviewMarkdown);
  const expectedReviewRows = environment.DRILL_EXPECTED_REVIEW_ROWS?.trim();
  if (expectedReviewRows) {
    if (!/^\d+$/u.test(expectedReviewRows)) throw new Error("DRILL_EXPECTED_REVIEW_ROWS must be a non-negative integer.");
    if (reviews.length !== Number.parseInt(expectedReviewRows, 10)) {
      throw new Error(`Expected ${expectedReviewRows} review rows, but found ${reviews.length}.`);
    }
  }

  const cards = mergeReviewState(masterCards, reviews);
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cards,
  };
  assertValidCardsDocument(document, { expectedCounts: expectedCountsFromEnvironment(environment) });

  const summary = formatCounts(cards, reviews.length);
  if (await cardsAreUnchanged(cards)) {
    console.log(`Data is already synchronized (${summary}).`);
    return { changed: false, document };
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = path.join(path.dirname(OUTPUT_PATH), `.cards.${process.pid}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, OUTPUT_PATH);
  console.log(`Synchronized public/data/cards.json (${summary}).`);
  return { changed: true, document };
}

async function main() {
  try {
    await loadLocalEnv();
    await syncData();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && Array.isArray(error.issues)) {
      for (const issue of error.issues) console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
