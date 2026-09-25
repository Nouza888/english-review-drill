import { DataFormatError } from "./markdown.mjs";

function plainText(value) {
  return value.replace(/`+/gu, "").replace(/\*\*([^*]+)\*\*/gu, "$1").trim();
}

/** Read only the explicitly publishable fields from the numbered study notes. */
export function parseEssentialsMarkdown(markdown, { detailed = false } = {}) {
  const addedAt = markdown.match(/^created: (\d{4}-\d{2}-\d{2})\s*$/mu)?.[1];
  if (!addedAt) throw new DataFormatError("The essentials note needs a created date.");
  const sections = [];
  let theme = "";
  let section;
  for (const line of markdown.split(/\r?\n/u)) {
    if (/^## /u.test(line)) {
      theme = line.slice(3).replace(/：\d+〜\d+\s*$/u, "").trim();
      section = undefined;
    }
    const heading = line.match(/^### (\d{2})｜(.+)$/u);
    if (heading) {
      section = { number: Number(heading[1]), theme, lines: [] };
      sections.push(section);
    } else if (section) section.lines.push(line);
  }
  if (!sections.length) throw new DataFormatError("No numbered essentials were found.");
  const seen = new Set();
  return sections.map(({ number, theme: sectionTheme, lines }) => {
    if (seen.has(number)) throw new DataFormatError(`Duplicate essentials number ${number}.`);
    seen.add(number);
    function field(label, required = true) {
      const prefix = `**${label}**：`;
      const matches = lines.filter((line) => line.startsWith(prefix));
      if (matches.length > 1 || (required && matches.length !== 1)) {
        throw new DataFormatError(`Essentials ${number}: invalid ${label} field.`);
      }
      const value = plainText(matches[0]?.slice(prefix.length) ?? "");
      if (required && !value) throw new DataFormatError(`Essentials ${number}: empty ${label} field.`);
      return value;
    }
    const answers = lines.filter((line) => line.startsWith("> "));
    if (answers.length !== 1 || !answers[0].slice(2).trim() || !sectionTheme) {
      throw new DataFormatError(`Essentials ${number}: missing answer or theme.`);
    }
    const note = detailed ? field("関連メモ", false) || field("解説", false) : "";
    if (detailed && !note) throw new DataFormatError(`Essentials ${number}: missing explanation.`);
    return {
      number, addedAt, theme: sectionTheme,
      promptJa: field("日本語"), answerEn: answers[0].slice(2).trim(), pattern: field("型"),
      // Old exercise references are provenance, not part of the new drill's numbering.
      note: note.replace(/(?:原文)?ED-\d{4}の?/gu, "").trim(),
      alternative: detailed ? field("別解・類似表現", false) : "",
    };
  });
}

export function buildEssentialCards(sources) {
  const cards = [];
  let expectedNumber = 1;
  for (const { quick, detailed, label } of sources) {
    const prompts = parseEssentialsMarkdown(quick);
    const explanations = parseEssentialsMarkdown(detailed, { detailed: true });
    if (prompts.length !== explanations.length) throw new DataFormatError("Quick and detailed notes have different counts.");
    prompts.forEach((prompt, index) => {
      const explanation = explanations[index];
      if (prompt.number !== expectedNumber++) throw new DataFormatError("Essentials must be numbered consecutively from 01.");
      for (const key of ["number", "promptJa", "answerEn", "pattern"]) {
        if (prompt[key] !== explanation[key]) {
          throw new DataFormatError(`Essentials ${prompt.number}: quick and detailed notes disagree on ${key}.`);
        }
      }
      cards.push({
        id: `TE-${String(prompt.number).padStart(4, "0")}`,
        addedAt: prompt.addedAt, source: [label], difficulty: null, theme: prompt.theme,
        promptJa: prompt.promptJa, answerEn: prompt.answerEn, phrases: [prompt.pattern],
        points: [explanation.note, ...(explanation.alternative ? [`別解・類似表現：${explanation.alternative}`] : [])],
        reviewStatus: null, lastReviewedAt: null, attempts: 0, answerProvenance: "assistant-model",
      });
    });
  }
  return cards;
}

// Curated semantic links: the condensed sentence numbers differ from the old ED IDs.
const ESSENTIAL_TERM_NUMBERS = {
  "TERM-0024": [11], // waiting for Engineering is covered in this explanation
  "TERM-0033": [1],
  "TERM-0034": [37],
  "TERM-0035": [40],
  "TERM-0036": [35],
  "TERM-0037": [38],
  "TERM-0038": [12],
  "TERM-0039": [38],
  "TERM-0040": [33],
  "TERM-0041": [28],
  "TERM-0042": [31],
  "TERM-0043": [4],
  "TERM-0044": [32],
};

export function remapEssentialGlossary(terms, tamCards) {
  if (!tamCards.some((card) => card.id.startsWith("TE-"))) return terms;
  return terms.map((term) => {
    if (!term.cardIds.some((id) => id.startsWith("ED-"))) return term;
    const numbers = ESSENTIAL_TERM_NUMBERS[term.id];
    if (!numbers) throw new DataFormatError("A legacy glossary link needs an explicit essentials mapping.");
    return {
      ...term,
      cardIds: [...new Set([
        ...numbers.map((number) => `TE-${String(number).padStart(4, "0")}`),
        ...term.cardIds.filter((id) => !id.startsWith("ED-")),
      ])],
    };
  });
}
