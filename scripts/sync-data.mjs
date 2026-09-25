import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertValidCardsDocument, countCards, expectedCountsFromEnvironment } from "./lib/data.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { buildEssentialCards } from "./lib/essentials.mjs";

const OUTPUT_PATH = path.resolve("public/data/cards.json");

async function readRequiredInput(environment, name) {
  const configuredPath = environment[name]?.trim();
  if (!configuredPath) throw new Error(`${name} is required. Set the private source path in .env.`);
  try { return await readFile(path.resolve(configuredPath), "utf8"); }
  catch { throw new Error(`Could not read ${name}. Check that the configured source is accessible.`); }
}

function formatCounts(cards) {
  const counts = countCards(cards);
  return `${counts.total} total / ${counts.review} review / ${counts.mastered} mastered / ${counts.regular} regular`;
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
  const [core, coreNotes, extension, extensionNotes] = await Promise.all([
    readRequiredInput(environment, "DRILL_TAM_CORE_PATH"),
    readRequiredInput(environment, "DRILL_TAM_CORE_NOTES_PATH"),
    readRequiredInput(environment, "DRILL_TAM_EXTENSION_PATH"),
    readRequiredInput(environment, "DRILL_TAM_EXTENSION_NOTES_PATH"),
  ]);
  const cards = buildEssentialCards([
    { quick: core, detailed: coreNotes, label: "既存40選（01〜40）" },
    { quick: extension, detailed: extensionNotes, label: "追加40選（41〜80）" },
  ]);
  if (cards.length !== 80 || cards.filter((card) => card.source[0] === "既存40選（01〜40）").length !== 40) {
    throw new Error("Expected 40 core and 40 additional TAM essentials.");
  }
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cards,
  };
  assertValidCardsDocument(document, { expectedCounts: expectedCountsFromEnvironment(environment) });

  const summary = formatCounts(cards);
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
