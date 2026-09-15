import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertValidCardsDocument } from "./lib/data.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { assertValidLibraryDocument, parseGlossaryMarkdown } from "./lib/library.mjs";
import { parseMasterMarkdown } from "./lib/markdown.mjs";

async function readRequiredInput(environment, name) {
  const configuredPath = environment[name]?.trim();
  if (!configuredPath) throw new Error(`${name} is required. Set the private source path in .env.`);
  try { return await readFile(path.resolve(configuredPath), "utf8"); }
  catch { throw new Error(`Could not read ${name}. Check that the configured source is accessible.`); }
}

export async function readPublicJson(inputPath, label) {
  try { return JSON.parse(await readFile(path.resolve(inputPath), "utf8")); }
  catch { throw new Error(`Could not read valid ${label} JSON.`); }
}

export async function syncLibrary(environment = process.env, options = {}) {
  const outputPath = path.resolve(options.outputPath ?? "public/data/library.json");
  const cardsPath = options.cardsPath ?? "public/data/cards.json";
  const now = options.now ?? (() => new Date());
  const [masterMarkdown, glossaryMarkdown, legacyDocument] = await Promise.all([
    readRequiredInput(environment, "DRILL_TOEIC_MASTER_PATH"),
    readRequiredInput(environment, "DRILL_GLOSSARY_PATH"),
    readPublicJson(cardsPath, "TAM cards"),
  ]);
  assertValidCardsDocument(legacyDocument);
  let cards;
  try { cards = parseMasterMarkdown(masterMarkdown); }
  catch { throw new Error("Could not parse the TOEIC master table. Check required columns, values, dates, and unique IDs."); }
  const terms = parseGlossaryMarkdown(glossaryMarkdown);
  const document = { schemaVersion: 1, generatedAt: now().toISOString(), cards, terms };
  assertValidLibraryDocument(document, legacyDocument.cards);

  let existing;
  try {
    existing = await readPublicJson(outputPath, "library");
    assertValidLibraryDocument(existing, legacyDocument.cards);
  } catch { existing = null; }
  if (existing && JSON.stringify(existing.cards) === JSON.stringify(cards) && JSON.stringify(existing.terms) === JSON.stringify(terms)) {
    console.log(`Library is already synchronized (${cards.length} TOEIC/daily cards / ${terms.length} shared terms).`);
    return { changed: false, document: existing };
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(outputPath), `.library.${process.pid}.${randomUUID()}.tmp`);
  let temporaryWritten = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    temporaryWritten = true;
    await rename(temporaryPath, outputPath);
  } finally {
    if (temporaryWritten) await unlink(temporaryPath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
  console.log(`Synchronized library data (${cards.length} TOEIC/daily cards / ${terms.length} shared terms).`);
  return { changed: true, document };
}

async function main() {
  try { await loadLocalEnv(); await syncLibrary(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && Array.isArray(error.issues)) for (const issue of error.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
