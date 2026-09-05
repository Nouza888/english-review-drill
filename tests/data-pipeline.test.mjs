import { describe, expect, it } from "vitest";
import {
  DataValidationError,
  assertValidCardsDocument,
  findDuplicateCards,
  mergeReviewState,
  scanSensitiveCards,
  validateCardsDocument,
} from "../scripts/lib/data.mjs";
import { DataFormatError, parseMasterMarkdown, parseReviewMarkdown } from "../scripts/lib/markdown.mjs";

const masterMarkdown = `
# Master

| ID | Added | Source | Difficulty | Theme | Japanese prompt | Final English | Reusable phrases | Points | Answer provenance |
|---|---|---|---|---|---|---|---|---|---|
| drill-001 | 2026-07-17 | study-chat-1<br>study-chat-2 | Medium | 会議 | A \\| B を確認しましょう。 | Let's confirm A \\| B. | before / after<br>confirm A | Slashで分割しない。<br>簡潔に述べる。 | accepted |
| drill-002 | 2026-07-19 | study-chat-2 | Hard | 調査 | 原因は調査中です。 | The cause is still under investigation. | under investigation | still の位置に注意する。 | assistant-model |
`;

const reviewMarkdown = `
## List

| ID | Status | Added | Theme | Japanese prompt | Final English | Reusable phrase | Last review | Attempts |
|---|---|---|---|---|---|---|---|---:|
| drill-001 | ⭐ 要復習 | 2026-07-17 | 会議 | A \\| B を確認しましょう。 | Let's confirm A \\| B. | before / after<br>confirm A | — | 0 |
`;

function validDocument(cards = mergeReviewState(parseMasterMarkdown(masterMarkdown), parseReviewMarkdown(reviewMarkdown))) {
  return { schemaVersion: 1, generatedAt: "2026-09-05T00:00:00.000Z", cards };
}

describe("Markdown data parsing", () => {
  it("parses escaped pipes and canonical <br> multi-values without splitting slashes", () => {
    const cards = parseMasterMarkdown(masterMarkdown);
    expect(cards).toHaveLength(2);
    expect(cards[0].promptJa).toBe("A | B を確認しましょう。");
    expect(cards[0].source).toEqual(["study-chat-1", "study-chat-2"]);
    expect(cards[0].phrases).toEqual(["before / after", "confirm A"]);
    expect(cards[0].points).toHaveLength(2);
  });

  it("parses review state and merges it by stable ID", () => {
    const cards = mergeReviewState(parseMasterMarkdown(masterMarkdown), parseReviewMarkdown(reviewMarkdown));
    expect(cards[0]).toMatchObject({ reviewStatus: "review", lastReviewedAt: null, attempts: 0 });
    expect(cards[1]).toMatchObject({ reviewStatus: null, lastReviewedAt: null, attempts: 0 });
  });

  it("fails on a malformed table row", () => {
    const malformed = masterMarkdown.replace(
      "| drill-002 | 2026-07-19 | study-chat-2 | Hard |",
      "| drill-002 | 2026-07-19 | Hard |",
    );
    expect(() => parseMasterMarkdown(malformed)).toThrow(DataFormatError);
  });

  it("fails on missing required values and invalid review status", () => {
    expect(() => parseMasterMarkdown(masterMarkdown.replace("under investigation | still", " | still"))).toThrow(
      DataFormatError,
    );
    expect(() => parseReviewMarkdown(reviewMarkdown.replace("⭐ 要復習", "保留"))).toThrow(DataFormatError);
  });

  it("fails when a review ID is absent from the master", () => {
    const reviews = parseReviewMarkdown(reviewMarkdown.replaceAll("drill-001", "drill-999"));
    expect(() => mergeReviewState(parseMasterMarkdown(masterMarkdown), reviews)).toThrow(DataValidationError);
  });
});

describe("document validation", () => {
  it("accepts a valid merged document", () => {
    expect(validateCardsDocument(validDocument())).toEqual([]);
  });

  it("detects normalized prompt and answer duplicates", () => {
    const cards = parseMasterMarkdown(masterMarkdown);
    const duplicate = { ...cards[1], id: "drill-003", promptJa: `${cards[0].promptJa}  ` };
    expect(findDuplicateCards([...cards, duplicate])).toContain(
      'Japanese prompt duplicates cards “drill-001” and “drill-003”.',
    );
  });

  it("blocks sensitive values without echoing the matched value", () => {
    const [card] = parseMasterMarkdown(masterMarkdown);
    const privateValue = "person@example.com";
    const findings = scanSensitiveCards([{ ...card, answerEn: `Contact ${privateValue}` }]);
    expect(findings).toEqual([{ cardId: "drill-001", field: "answerEn", category: "email address" }]);
    expect(JSON.stringify(findings)).not.toContain(privateValue);
  });

  it("blocks URLs, SRs, OCIDs, IPs, local paths, and UUID-shaped task identifiers", () => {
    const [card] = parseMasterMarkdown(masterMarkdown);
    const syntheticSr = ["3", "1234567890"].join("-");
    const syntheticLocalPath = ["", "Users", "example", "private"].join("/");
    const syntheticTaskId = ["019f6e69", "29ce", "7580", "9d0d", "bf7404071473"].join("-");
    const findings = scanSensitiveCards([
      {
        ...card,
        points: [
          "https://example.com",
          `${syntheticSr} and ocid1.instance.region.value`,
          `10.0.0.1 in ${syntheticLocalPath} and ${syntheticTaskId}`,
        ],
      },
    ]);
    expect(new Set(findings.map(({ category }) => category))).toEqual(
      new Set([
        "URL",
        "Oracle SR number",
        "Oracle Cloud identifier",
        "IP address",
        "local filesystem path",
        "thread or session identifier",
      ]),
    );
  });

  it("rejects unexpected public fields and controlled count mismatches", () => {
    const document = validDocument();
    document.cards[0] = { ...document.cards[0], threadId: "private" };
    const issues = validateCardsDocument(document, {
      expectedCounts: { total: 86, review: 17, mastered: 1, regular: 68 },
    });
    expect(issues).toContain("cards[0] contains missing or unexpected fields.");
    expect(issues).toContain("Expected total=86, but found 2.");
  });

  it("assertion safely stops on malformed JSON-shaped data", () => {
    expect(() =>
      assertValidCardsDocument({ schemaVersion: 1, generatedAt: "not-a-date", cards: [{ id: "x" }] }),
    ).toThrow(DataValidationError);
    expect(() =>
      assertValidCardsDocument({ schemaVersion: 1, generatedAt: "2026-09-05T00:00:00.000Z", cards: [null] }),
    ).toThrow(DataValidationError);
  });
});
