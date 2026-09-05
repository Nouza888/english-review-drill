import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertValidCardsDocument, countCards, expectedCountsFromEnvironment } from "./lib/data.mjs";
import { loadLocalEnv } from "./lib/env.mjs";

export async function validateDataFile(inputPath = "public/data/cards.json", environment = process.env) {
  const document = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  assertValidCardsDocument(document, { expectedCounts: expectedCountsFromEnvironment(environment) });
  return countCards(document.cards);
}

async function main() {
  try {
    await loadLocalEnv();
    const inputPath = process.argv[2] ?? "public/data/cards.json";
    const counts = await validateDataFile(inputPath);
    console.log(
      `Valid data: ${counts.total} total / ${counts.review} review / ${counts.mastered} mastered / ${counts.regular} regular.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && Array.isArray(error.issues)) {
      for (const issue of error.issues) console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
