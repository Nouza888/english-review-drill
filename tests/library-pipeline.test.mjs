import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataValidationError } from "../scripts/lib/data.mjs";
import { assertValidLibraryDocument, parseGlossaryMarkdown, validateLibraryDocument } from "../scripts/lib/library.mjs";
import { DataFormatError, parseMasterMarkdown } from "../scripts/lib/markdown.mjs";
import { syncLibrary } from "../scripts/sync-library.mjs";
import { validateLibraryFile } from "../scripts/validate-library.mjs";

const masterMarkdown = `
| ID | Added | Source | Difficulty | Theme | Japanese prompt | Final English | Reusable phrases | Points | Answer provenance |
|---|---|---|---|---|---|---|---|---|---|
| TD-0001 | 2026-09-15 | TOEIC・日常英語 | Easy | 連絡 | 電話をかける必要があります。 | I need to make a phone call. | make a phone call | make a phone call で電話をかける。 | assistant-model |
`;
const glossaryMarkdown = `
# Shared glossary

| ID | Expression | Meaning | Example | Point | Tags | Card IDs |
|---|---|---|---|---|---|---|
| TERM-0001 | make a phone call | 電話をかける | I need to make a phone call. | make + 名詞。 | TOEIC / daily<br>TAM | TD-0001<br>ED-0001 |
`;

function legacyCards() {
  return [{ ...parseMasterMarkdown(masterMarkdown)[0], id: "ED-0001" }];
}

function document() {
  return {
    schemaVersion: 1, generatedAt: "2026-09-15T00:00:00.000Z",
    cards: parseMasterMarkdown(masterMarkdown), terms: parseGlossaryMarkdown(glossaryMarkdown),
  };
}

describe("shared glossary Markdown", () => {
  it("parses the exact seven columns and preserves slash-separated wording", () => {
    const [term] = parseGlossaryMarkdown(glossaryMarkdown);
    expect(term).toEqual({
      id: "TERM-0001", expression: "make a phone call", meaningJa: "電話をかける",
      exampleEn: "I need to make a phone call.", pointJa: "make + 名詞。",
      tags: ["TOEIC / daily", "TAM"], cardIds: ["TD-0001", "ED-0001"],
    });
  });

  it("supports escaped pipes and all supported br variants", () => {
    const markdown = glossaryMarkdown.replace("make + 名詞。", "A \\| B").replace("<br>", "<br />");
    expect(parseGlossaryMarkdown(markdown)[0].pointJa).toBe("A | B");
    expect(parseGlossaryMarkdown(markdown)[0].tags).toHaveLength(2);
  });

  it("rejects missing columns, multiple canonical tables, malformed rows, and empty values", () => {
    expect(() => parseGlossaryMarkdown(glossaryMarkdown.replace("Card IDs", "Links"))).toThrow(DataFormatError);
    expect(() => parseGlossaryMarkdown(glossaryMarkdown + glossaryMarkdown)).toThrow(DataFormatError);
    expect(() => parseGlossaryMarkdown(glossaryMarkdown.replace("| TERM-0001 |", "|"))).toThrow(DataFormatError);
    expect(() => parseGlossaryMarkdown(glossaryMarkdown.replace("| 電話をかける |", "| |"))).toThrow(DataFormatError);
  });
});

describe("supplemental library validation", () => {
  it("accepts references to both collections and the same body in different collections", () => {
    expect(validateLibraryDocument(document(), legacyCards())).toEqual([]);
  });

  it("rejects card ID collisions while still validating duplicate bodies within TOEIC", () => {
    const library = document();
    library.cards.push({ ...library.cards[0], id: "TD-0002" });
    expect(validateLibraryDocument(library, legacyCards()).join(" ")).toContain("duplicates cards");
    library.cards[0].id = "ED-0001";
    expect(validateLibraryDocument(library, legacyCards())).toContain("cards[0].id collides with an existing card ID.");
    library.cards[1].id = "ED-0001";
    expect(validateLibraryDocument(library, legacyCards()).join(" ")).toContain("Duplicate card ID");
  });

  it("rejects normalized duplicate expressions and duplicate term IDs", () => {
    const library = document();
    library.terms.push({ ...library.terms[0], expression: "  MAKE   A PHONE CALL.  " });
    const issues = validateLibraryDocument(library, legacyCards());
    expect(issues).toContain("terms[1].id duplicates another glossary ID.");
    expect(issues).toContain("terms[1].expression duplicates another glossary expression.");
  });

  it("rejects orphaned or repeated links and empty tag arrays", () => {
    const library = document();
    library.terms[0].cardIds = ["unknown-card", "unknown-card"];
    library.terms[0].tags = [];
    const issues = validateLibraryDocument(library, legacyCards());
    expect(issues).toContain("terms[0].cardIds[0] must reference an existing card.");
    expect(issues).toContain("terms[0].cardIds contains duplicate values.");
    expect(issues).toContain("terms[0].tags must contain at least one non-empty string.");
  });

  it("rejects unexpected fields, malformed roots, missing terms, and invalid timestamps", () => {
    expect(validateLibraryDocument(null)).toEqual(["Library document must be an object."]);
    const library = document();
    library.generatedAt = "invalid";
    library.privateNote = "not for publication";
    library.terms[0].unexpected = true;
    const issues = validateLibraryDocument(library, legacyCards());
    expect(issues).toContain("generatedAt must be an ISO 8601 timestamp.");
    expect(issues).toContain("Library document contains missing or unexpected fields.");
    expect(issues).toContain("terms[0] contains missing or unexpected fields.");
    expect(() => assertValidLibraryDocument({ ...document(), terms: [] }, legacyCards())).toThrow(DataValidationError);
    expect(() => assertValidLibraryDocument({ ...document(), cards: [null], terms: [null] }, legacyCards())).toThrow(DataValidationError);
  });

  it.each(["id", "expression", "meaningJa", "exampleEn", "pointJa", "tags", "cardIds"])(
    "scans %s without exposing the sensitive value", (field) => {
      const library = document();
      const privateValue = "person@example.com";
      library.terms[0][field] = ["tags", "cardIds"].includes(field) ? [privateValue] : privateValue;
      const issues = validateLibraryDocument(library, legacyCards()).join(" ");
      expect(issues).toContain("Sensitive email address detected");
      expect(issues).not.toContain(privateValue);
    },
  );

  it("redacts sensitive new card IDs and scans card content using existing rules", () => {
    const library = document();
    const privateValue = "person@example.com";
    library.cards[0].id = privateValue;
    library.cards[0].points = [privateValue];
    const issues = validateLibraryDocument(library, legacyCards()).join(" ");
    expect(issues).toContain("non-sensitive, stable, URL-safe identifier");
    expect(issues).toContain("Sensitive email address");
    expect(issues).not.toContain(privateValue);
  });
});

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "english-library-test-"));
  temporaryDirectories.push(directory);
  const masterPath = path.join(directory, "master.md");
  const glossaryPath = path.join(directory, "glossary.md");
  const cardsPath = path.join(directory, "cards.json");
  const outputPath = path.join(directory, "library.json");
  await Promise.all([
    writeFile(masterPath, masterMarkdown), writeFile(glossaryPath, glossaryMarkdown),
    writeFile(cardsPath, JSON.stringify({ schemaVersion: 1, generatedAt: "2026-09-14T00:00:00.000Z", cards: legacyCards() })),
  ]);
  return {
    directory, masterPath, glossaryPath, cardsPath, outputPath,
    environment: { DRILL_TOEIC_MASTER_PATH: masterPath, DRILL_GLOSSARY_PATH: glossaryPath },
    options: { outputPath, cardsPath, now: () => new Date("2026-09-15T00:00:00.000Z") },
  };
}

describe("library synchronization", () => {
  it("generates valid supplemental JSON without changing TAM, then leaves content and mtime unchanged", async () => {
    const setup = await fixture();
    const tamBefore = await readFile(setup.cardsPath, "utf8");
    expect((await syncLibrary(setup.environment, setup.options)).changed).toBe(true);
    const original = await readFile(setup.outputPath, "utf8");
    const originalStat = await stat(setup.outputPath);
    const second = await syncLibrary(setup.environment, { ...setup.options, now: () => new Date("2026-09-16T00:00:00.000Z") });
    expect(second.changed).toBe(false);
    expect(second.document.generatedAt).toBe("2026-09-15T00:00:00.000Z");
    expect(await readFile(setup.outputPath, "utf8")).toBe(original);
    expect((await stat(setup.outputPath)).mtimeMs).toBe(originalStat.mtimeMs);
    expect(await readFile(setup.cardsPath, "utf8")).toBe(tamBefore);
    expect(await validateLibraryFile(setup.outputPath, setup.cardsPath)).toEqual({ cards: 1, terms: 1 });
    expect((await readdir(setup.directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("leaves previously generated data untouched when a new glossary link is invalid", async () => {
    const setup = await fixture();
    await syncLibrary(setup.environment, setup.options);
    const original = await readFile(setup.outputPath, "utf8");
    await writeFile(setup.glossaryPath, glossaryMarkdown.replace("TD-0001<br>ED-0001", "TD-9999"));
    await expect(syncLibrary(setup.environment, setup.options)).rejects.toThrow(DataValidationError);
    expect(await readFile(setup.outputPath, "utf8")).toBe(original);
  });

  it("stops on missing sources and invalid JSON without exposing source paths or raw JSON", async () => {
    const setup = await fixture();
    await expect(syncLibrary({}, setup.options)).rejects.toThrow("DRILL_TOEIC_MASTER_PATH is required");
    await writeFile(setup.cardsPath, '{"private": person@example.com}');
    await expect(syncLibrary(setup.environment, setup.options)).rejects.toThrow("Could not read valid TAM cards JSON.");
  });
});
