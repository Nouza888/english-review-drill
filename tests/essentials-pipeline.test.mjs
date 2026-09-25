import { describe, expect, it } from "vitest";
import { buildEssentialCards, parseEssentialsMarkdown, remapEssentialGlossary } from "../scripts/lib/essentials.mjs";
import { assertValidCardsDocument } from "../scripts/lib/data.mjs";

const quick = `---
created: 2026-09-25
---
# Essentials
## 確認する：01〜01
### 01｜確認
**日本語**：担当者を確認させてください。
> Let me confirm the owner.
**型**：\`Let me confirm + 内容\`
`;
const detailed = quick + `
**関連メモ**：ED-0001の \`Let me confirm\` は確認を切り出す表現です。
**元の問題**：ED-0001
**参照**：[Private reference](https://example.invalid/private)
**追加した理由**：Private learning history that must not be exported.
`;
function sources() { return [{ quick, detailed, label: "既存40選（01〜40）" }]; }

describe("numbered essentials import", () => {
  it("exports only study fields and does not carry forward old IDs or review history", () => {
    const cards = buildEssentialCards(sources());
    expect(cards[0]).toMatchObject({
      id: "TE-0001", promptJa: "担当者を確認させてください。", answerEn: "Let me confirm the owner.",
      theme: "確認する", phrases: ["Let me confirm + 内容"],
      points: ["Let me confirm は確認を切り出す表現です。"],
      difficulty: null, reviewStatus: null, lastReviewedAt: null, attempts: 0, answerProvenance: "assistant-model",
    });
    const output = JSON.stringify(cards);
    for (const excluded of ["ED-0001", "https://", "Private learning"]) expect(output).not.toContain(excluded);
    expect(() => assertValidCardsDocument({ schemaVersion: 1, generatedAt: "2026-09-25T00:00:00.000Z", cards })).not.toThrow();
  });

  it("combines consecutive sets and includes extension explanations and alternatives", () => {
    const second = quick.replaceAll("01", "02").replaceAll("担当者", "期限").replace("the owner", "the deadline");
    const secondDetailed = second + '\n**解説**：期限を確認します。\n**別解・類似表現**：Let me check the deadline.\n';
    const cards = buildEssentialCards([...sources(), { quick: second, detailed: secondDetailed, label: "追加40選（41〜80）" }]);
    expect(cards.map((card) => card.id)).toEqual(["TE-0001", "TE-0002"]);
    expect(cards[1].points).toEqual(["期限を確認します。", "別解・類似表現：Let me check the deadline."]);
  });

  it("rejects numbering gaps, duplicates, missing fields and inconsistent parallel notes", () => {
    expect(() => buildEssentialCards([{ ...sources()[0], quick: quick.replace("### 01", "### 03") }])).toThrow("consecutively");
    expect(() => parseEssentialsMarkdown(quick + quick)).toThrow("Duplicate");
    expect(() => parseEssentialsMarkdown(quick.replace("**日本語**", "**質問**"))).toThrow("日本語");
    expect(() => buildEssentialCards([{ ...sources()[0], detailed: detailed.replace("the owner", "the deadline") }])).toThrow("disagree");
    expect(() => buildEssentialCards([{ ...sources()[0], detailed: quick }])).toThrow("missing explanation");
    expect(() => parseEssentialsMarkdown(quick.replace("created:", "updated:"))).toThrow("created date");
  });
});

describe("glossary links after replacing the old TAM deck", () => {
  const terms = [
    { id: "TERM-0040", expression: "focus on", cardIds: ["ED-0027", "ED-0048", "TD-0066"] },
    { id: "TERM-0001", expression: "other", cardIds: ["TD-0001"] },
  ];
  it("maps by meaning, preserves TOEIC links, deduplicates and leaves source rows untouched", () => {
    const original = JSON.stringify(terms);
    const remapped = remapEssentialGlossary(terms, [{ id: "TE-0001" }]);
    expect(remapped[0].cardIds).toEqual(["TE-0033", "TD-0066"]);
    expect(remapped[1]).toBe(terms[1]);
    expect(JSON.stringify(terms)).toBe(original);
    expect(remapEssentialGlossary(remapped, [{ id: "TE-0001" }])).toEqual(remapped);
    expect(remapEssentialGlossary(terms, [{ id: "ED-0001" }])).toBe(terms);
  });

  it("fails instead of silently attaching an unknown old term to the wrong sentence", () => {
    expect(() => remapEssentialGlossary([{ id: "TERM-9999", cardIds: ["ED-0001"] }], [{ id: "TE-0001" }])).toThrow("explicit essentials mapping");
  });
});
