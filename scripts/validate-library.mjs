import { pathToFileURL } from "node:url";
import { assertValidCardsDocument } from "./lib/data.mjs";
import { assertValidLibraryDocument } from "./lib/library.mjs";
import { readPublicJson } from "./sync-library.mjs";

export async function validateLibraryFile(inputPath = "public/data/library.json", cardsPath = "public/data/cards.json") {
  const [document, legacyDocument] = await Promise.all([
    readPublicJson(inputPath, "library"), readPublicJson(cardsPath, "TAM cards"),
  ]);
  assertValidCardsDocument(legacyDocument);
  assertValidLibraryDocument(document, legacyDocument.cards);
  return { cards: document.cards.length, terms: document.terms.length };
}

async function main() {
  try {
    const counts = await validateLibraryFile(process.argv[2], process.argv[3]);
    console.log(`Valid library: ${counts.cards} TOEIC/daily cards / ${counts.terms} shared terms.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && Array.isArray(error.issues)) for (const issue of error.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
