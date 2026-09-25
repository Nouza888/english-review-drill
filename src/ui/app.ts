import type { Difficulty, DrillCard, GlossaryTerm, StudyCard } from "../types";
import { createDrillQueue, type DrillOrder } from "../lib/cards";
import {
  COLLECTION_LABELS, filterGlossary, filterStudyCards, relatedTerms, termCollections,
  type CollectionId,
} from "../lib/library";

type Route = "drill" | "list" | "glossary";
type DrillPool = "review" | "mastered" | "all" | "session";
type StatusFilter = "all" | "review" | "mastered" | "regular" | "session";

interface DrillFilters {
  pool: DrillPool;
  theme: string;
  difficulty: string;
  source: string;
  order: DrillOrder;
}

interface ListFilters {
  query: string;
  status: StatusFilter;
  theme: string;
  difficulty: string;
  source: string;
}

interface DeckState {
  ids: string[];
  position: number;
  cycle: number;
  currentId: string | null;
}

const ALL = "__all__";
const UNSET = "__unset__";

export function mountApp(root: HTMLElement, cards: StudyCard[], generatedAt: string, terms: GlossaryTerm[]): void {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const glossaryTags = uniqueSorted(terms.flatMap((term) => term.tags));
  // This practice state lives only in this page instance; it never changes the source cards.
  const sessionReviewIds = new Set<string>();
  const answerDrafts = new Map<string, string>();

  let route = routeFromHash(window.location.hash);
  let collectionId: CollectionId = "tam";
  let glossaryQuery = "";
  let glossaryTag = ALL;
  let answerVisible = false;
  let drillFilters: DrillFilters = { pool: "all", theme: ALL, difficulty: ALL, source: ALL, order: "listed" };
  let listFilters: ListFilters = {
    query: "",
    status: "all",
    theme: ALL,
    difficulty: ALL,
    source: ALL,
  };
  let deck: DeckState = { ids: [], position: 0, cycle: 1, currentId: null };

  resetDeck();
  renderShell();

  if (!isValidHash(window.location.hash)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/drill`);
  }
  focusLinkedTerm();

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("keydown", handleKeyboardShortcut);

  function collectionCards(): StudyCard[] {
    return cards.filter((card) => card.collectionId === collectionId);
  }

  function collectionOptions(): { themes: string[]; sources: string[]; difficulties: string[]; hasUnsetDifficulty: boolean } {
    const scoped = collectionCards();
    return {
      themes: uniqueSorted(scoped.map((card) => card.theme)),
      sources: uniqueSorted(scoped.flatMap((card) => card.source)),
      difficulties: (["Easy", "Medium", "Hard"] as const).filter((difficulty) => scoped.some((card) => card.difficulty === difficulty)),
      hasUnsetDifficulty: scoped.some((card) => card.difficulty === null),
    };
  }

  function renderShell(): void {
    const scoped = collectionCards();
    const reviewCount = scoped.filter((card) => card.reviewStatus === "review").length;
    const masteredCount = scoped.filter((card) => card.reviewStatus === "mastered").length;
    const pageLabel = { drill: "ドリル", list: "問題一覧", glossary: "用語集" }[route];

    root.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="#/drill" aria-label="瞬発英語ドリル ホーム">
            <span class="brand-mark" aria-hidden="true">Aa</span>
            <span>
              <span class="eyebrow">English Review</span>
              <span class="brand-title">瞬発英語ドリル</span>
            </span>
          </a>
          <nav class="primary-nav" aria-label="メインメニュー">
            <a href="#/drill" ${route === "drill" ? 'aria-current="page"' : ""}>ドリル</a>
            <a href="#/list" ${route === "list" ? 'aria-current="page"' : ""}>問題一覧</a>
            <a href="#/glossary" ${route === "glossary" ? 'aria-current="page"' : ""}>用語集</a>
          </nav>
        </div>
      </header>
      <main id="main-content" class="page-shell" tabindex="-1">
        <h1 class="sr-only">${pageLabel}</h1>
        ${route !== "glossary" ? renderCollectionSwitch() : ""}
        <div class="summary-bar">
          ${route === "glossary" ? `
          <dl class="summary-stats" aria-label="用語集の収録状況">
            <div><dt>共通の表現・用語</dt><dd>${terms.length}</dd></div>
          </dl>` : `
          <dl class="summary-stats" aria-label="${escapeAttribute(COLLECTION_LABELS[collectionId])}の収録状況">
            <div><dt>全問題</dt><dd>${scoped.length}</dd></div>
            <div><dt>要復習</dt><dd>${reviewCount}</dd></div>
            <div><dt>定着済み</dt><dd>${masteredCount}</dd></div>
            <div><dt>今回のチェック</dt><dd id="session-review-count">${scoped.filter((card) => sessionReviewIds.has(card.id)).length}</dd></div>
          </dl>`}
        </div>
        ${route === "drill" ? renderDrillRoute() : route === "list" ? renderListRoute() : renderGlossaryRoute()}
      </main>
      <footer class="site-footer">
        <span>データ更新: ${escapeHtml(formatDate(generatedAt))}</span>
      </footer>
    `;
  }

  function renderCollectionSwitch(): string {
    return `
      <div class="collection-switch" role="group" aria-label="教材を選ぶ">
        ${(["tam", "toeic-daily"] as const).map((id) => `
          <button type="button" data-action="collection" data-collection="${id}" aria-pressed="${collectionId === id}">
            <span>${escapeHtml(COLLECTION_LABELS[id])}</span>
            <span class="collection-count">${cards.filter((card) => card.collectionId === id).length}問</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderDrillRoute(): string {
    const { themes, sources, difficulties, hasUnsetDifficulty } = collectionOptions();
    return `
      <section class="workspace" aria-label="ドリル">
        <div class="filter-bar drill-filters" aria-label="出題条件">
          <label>
            <span>出題範囲</span>
            <select name="drill-pool">
              ${option("review", "⭐ 要復習", drillFilters.pool)}
              ${option("all", "全問題", drillFilters.pool)}
              ${option("session", "今回のチェック", drillFilters.pool)}
              ${option("mastered", "✓ 定着済み", drillFilters.pool)}
            </select>
          </label>
          <label class="drill-source-filter">
            <span>出典</span>
            <select name="drill-source">
              ${option(ALL, "すべて", drillFilters.source)}
              ${sources.map((source) => option(source, source, drillFilters.source)).join("")}
            </select>
          </label>
          <label>
            <span>出題順</span>
            <select name="drill-order">
              ${option("listed", "掲載順", drillFilters.order)}
              ${option("random", "ランダム", drillFilters.order)}
            </select>
          </label>
          <label>
            <span>テーマ</span>
            <select name="drill-theme">
              ${option(ALL, "すべて", drillFilters.theme)}
              ${themes.map((theme) => option(theme, theme, drillFilters.theme)).join("")}
            </select>
          </label>
          <label>
            <span>難易度</span>
            <select name="drill-difficulty">
              ${option(ALL, "すべて", drillFilters.difficulty)}
              ${difficulties.map((difficulty) => option(difficulty, difficulty, drillFilters.difficulty)).join("")}
              ${hasUnsetDifficulty ? option(UNSET, "未設定", drillFilters.difficulty) : ""}
            </select>
          </label>
        </div>
        <div id="drill-panel">${renderDrillPanelMarkup()}</div>
        <p class="session-help">今回のチェックと入力文は、このタブでの練習用です。再読み込みすると消えます。</p>
        <p class="keyboard-help">キーボード: Spaceで解答表示、→で次の問題</p>
      </section>
    `;
  }

  function renderDrillPanelMarkup(): string {
    const currentCard = deck.currentId ? cardsById.get(deck.currentId) : undefined;

    if (!currentCard) {
      return `
        <div class="empty-state" role="status">
          <span class="empty-icon" aria-hidden="true">○</span>
          <h2>${drillFilters.pool === "session" ? "今回チェックした問題がありません" : "条件に合う問題がありません"}</h2>
          <p>${drillFilters.pool === "session" ? "「全問題」などで問題にチェックを付けるか、出典・テーマ・難易度を変更してください。" : "出題範囲またはフィルターを変更してください。"}</p>
        </div>
      `;
    }

    const total = deck.ids.length;
    const position = deck.position + 1;

    return `
      <article class="drill-card" aria-labelledby="drill-prompt">
        <div class="card-topline">
          <div class="badge-row">
            ${statusBadge(currentCard.reviewStatus)}
            ${currentCard.theme ? `<span class="badge badge-neutral">${escapeHtml(currentCard.theme)}</span>` : ""}
            ${currentCard.difficulty ? `<span class="badge badge-neutral">${escapeHtml(currentCard.difficulty)}</span>` : ""}
          </div>
          <span class="progress-label">${position} / ${total}<span class="sr-only">、${deck.cycle}周目</span></span>
        </div>
        <div class="prompt-block">
          <p class="prompt-label">日本語</p>
          <h2 id="drill-prompt" tabindex="-1">${escapeHtml(currentCard.promptJa)}</h2>
        </div>
        <label class="session-review-toggle${sessionReviewIds.has(currentCard.id) ? " is-marked" : ""}">
          <input type="checkbox" name="session-review" data-card-id="${escapeAttribute(currentCard.id)}" ${sessionReviewIds.has(currentCard.id) ? "checked" : ""} />
          <span>今回の要復習</span>
        </label>
        <div class="draft-block">
          <div class="draft-heading">
            <label for="answer-draft">自分の英作文 <span>（任意）</span></label>
            <button class="text-button" type="button" data-action="clear-draft">入力をクリア</button>
          </div>
          <textarea id="answer-draft" name="answer-draft" data-card-id="${escapeAttribute(currentCard.id)}" rows="3" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="draft-help" placeholder="答えを見る前に、ここに書いてみる">
${escapeHtml(answerDrafts.get(currentCard.id) ?? "")}</textarea>
          <p id="draft-help">答えを表示して、自分の英文と見比べられます。</p>
        </div>
        ${answerVisible ? renderAnswer(currentCard) : ""}
        <div class="card-actions">
          ${
            answerVisible
              ? '<button class="button button-primary" type="button" data-action="next">次の問題 <span aria-hidden="true">→</span></button>'
              : '<button class="button button-primary" type="button" data-action="reveal">模範解答を見る</button>'
          }
          ${answerVisible ? '<button class="button button-secondary" type="button" data-action="hide-answer">もう一度考える</button>' : ""}
        </div>
      </article>
    `;
  }

  function renderAnswer(card: StudyCard): string {
    return `
      <section class="answer-block" aria-live="polite" aria-labelledby="answer-heading">
        <p id="answer-heading" class="prompt-label">模範解答</p>
        <p class="answer-text" lang="en">${escapeHtml(card.answerEn)}</p>
        <div class="answer-notes">
          <div>
            <h3>Reusable phrases</h3>
            ${renderStringList(card.phrases, "登録なし", "en")}
          </div>
          <div>
            <h3>重要ポイント</h3>
            ${renderStringList(card.points, "登録なし")}
          </div>
        </div>
        ${renderRelatedTerms(card.id)}
      </section>
    `;
  }

  function renderListRoute(): string {
    const { themes, sources, difficulties, hasUnsetDifficulty } = collectionOptions();
    return `
      <section class="workspace" aria-label="問題一覧">
        <div class="search-block">
          <label for="card-search">キーワード検索</label>
          <div class="search-input-wrap">
            <span aria-hidden="true">⌕</span>
            <input id="card-search" name="card-search" type="search" value="${escapeAttribute(listFilters.query)}" placeholder="日本語・英語・フレーズから検索" autocomplete="off" />
          </div>
        </div>
        <div class="filter-bar list-filters" aria-label="一覧の絞り込み">
          <label>
            <span>状態</span>
            <select name="list-status">
              ${option("all", "すべて", listFilters.status)}
              ${option("review", "⭐ 要復習", listFilters.status)}
              ${option("session", "今回のチェック", listFilters.status)}
              ${option("mastered", "✓ 定着済み", listFilters.status)}
              ${option("regular", "通常", listFilters.status)}
            </select>
          </label>
          <label>
            <span>テーマ</span>
            <select name="list-theme">
              ${option(ALL, "すべて", listFilters.theme)}
              ${themes.map((theme) => option(theme, theme, listFilters.theme)).join("")}
            </select>
          </label>
          <label>
            <span>難易度</span>
            <select name="list-difficulty">
              ${option(ALL, "すべて", listFilters.difficulty)}
              ${difficulties.map((difficulty) => option(difficulty, difficulty, listFilters.difficulty)).join("")}
              ${hasUnsetDifficulty ? option(UNSET, "未設定", listFilters.difficulty) : ""}
            </select>
          </label>
          <label>
            <span>出典</span>
            <select name="list-source">
              ${option(ALL, "すべて", listFilters.source)}
              ${sources.map((source) => option(source, source, listFilters.source)).join("")}
            </select>
          </label>
        </div>
        <div class="result-summary"><strong id="result-count">${filteredListCards().length}</strong><span>件の問題</span></div>
        <div id="list-results" class="card-list">${renderListResultsMarkup()}</div>
      </section>
    `;
  }

  function renderListResultsMarkup(): string {
    const results = filteredListCards();

    if (results.length === 0) {
      return `
        <div class="empty-state compact" role="status">
          <span class="empty-icon" aria-hidden="true">○</span>
          <h2>該当する問題はありません</h2>
          <p>検索語またはフィルターを変更してください。</p>
        </div>
      `;
    }

    return results
      .map(
        (card, index) => `
          <details class="list-card">
            <summary>
              <span class="list-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
              <span class="list-prompt">${escapeHtml(card.promptJa)}</span>
              <span class="badge-row">
                ${statusBadge(card.reviewStatus)}
                ${sessionReviewIds.has(card.id) ? '<span class="badge badge-session">✓ 今回</span>' : ""}
                ${card.difficulty ? `<span class="badge badge-neutral">${escapeHtml(card.difficulty)}</span>` : ""}
              </span>
              <span class="summary-chevron" aria-hidden="true"></span>
            </summary>
            <div class="list-card-body">
              <div class="list-answer">
                <p class="prompt-label">模範解答</p>
                <p lang="en">${escapeHtml(card.answerEn)}</p>
              </div>
              <dl class="card-metadata">
                <div><dt>テーマ</dt><dd>${escapeHtml(card.theme || "未設定")}</dd></div>
                <div><dt>出典</dt><dd>${card.source.length ? card.source.map(escapeHtml).join(" / ") : "未設定"}</dd></div>
              </dl>
              <div class="answer-notes list-notes">
                <div><h3>Reusable phrases</h3>${renderStringList(card.phrases, "登録なし", "en")}</div>
                <div><h3>重要ポイント</h3>${renderStringList(card.points, "登録なし")}</div>
              </div>
              ${renderRelatedTerms(card.id)}
            </div>
          </details>
        `,
      )
      .join("");
  }

  function renderRelatedTerms(cardId: string): string {
    const related = relatedTerms(terms, cardId);
    if (related.length === 0) return "";
    return `<div class="related-terms"><h3>用語集で確認</h3><div class="term-links">${related.map((term) =>
      `<a href="#/glossary/${escapeAttribute(term.id)}" lang="en">${escapeHtml(term.expression)}</a>`,
    ).join("")}</div></div>`;
  }

  function renderGlossaryRoute(): string {
    return `
      <section class="workspace" aria-label="共通の表現・用語集">
        <div class="glossary-filters">
          <div class="search-block">
            <label for="glossary-search">表現・用語を検索</label>
            <div class="search-input-wrap">
              <span aria-hidden="true">⌕</span>
              <input id="glossary-search" name="glossary-search" type="search" value="${escapeAttribute(glossaryQuery)}" placeholder="英語・日本語・例文から検索" autocomplete="off" />
            </div>
          </div>
          <label class="glossary-tag-label"><span>タグ</span>
            <select name="glossary-tag">
              ${option(ALL, "すべて", glossaryTag)}
              ${glossaryTags.map((tag) => option(tag, tag, glossaryTag)).join("")}
            </select>
          </label>
        </div>
        <div class="result-summary" role="status"><strong id="glossary-count">${filteredTerms().length}</strong><span>件の表現・用語</span></div>
        <div id="glossary-results" class="glossary-list">${renderGlossaryResultsMarkup()}</div>
      </section>`;
  }

  function filteredTerms(): GlossaryTerm[] {
    return filterGlossary(terms, glossaryQuery, glossaryTag === ALL ? undefined : glossaryTag);
  }

  function renderGlossaryResultsMarkup(): string {
    const results = filteredTerms();
    if (results.length === 0) return '<div class="empty-state compact"><h2>該当する表現・用語はありません</h2><p>検索語またはタグを変更してください。</p></div>';
    return results.map((term) => {
      const linkedCards = term.cardIds.map((id) => cardsById.get(id)).filter((card): card is StudyCard => Boolean(card));
      return `
        <article class="glossary-card" id="term-${escapeAttribute(term.id)}" tabindex="-1" aria-labelledby="heading-${escapeAttribute(term.id)}">
          <div class="badge-row">
            ${term.tags.map((tag) => `<span class="badge badge-neutral">${escapeHtml(tag)}</span>`).join("")}
            ${termCollections(term, cards).map((id) => `<span class="badge badge-collection">${escapeHtml(COLLECTION_LABELS[id])}</span>`).join("")}
          </div>
          <h2 id="heading-${escapeAttribute(term.id)}" lang="en">${escapeHtml(term.expression)}</h2>
          <p class="term-meaning">${escapeHtml(term.meaningJa)}</p>
          <p class="term-example" lang="en">${escapeHtml(term.exampleEn)}</p>
          <p class="term-point"><span>Point</span>${escapeHtml(term.pointJa)}</p>
          ${linkedCards.length ? `<details class="term-related"><summary>関連する問題（${linkedCards.length}）</summary><ul>${linkedCards.map((card) => `
            <li><span>${escapeHtml(card.promptJa)}</span><button type="button" class="text-button" data-action="practice-card" data-card-id="${escapeAttribute(card.id)}">この問題を練習<span class="sr-only">: ${escapeHtml(card.promptJa)}</span></button></li>
          `).join("")}</ul></details>` : ""}
        </article>`;
    }).join("");
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
    if (!target) return;

    switch (target.dataset.action) {
      case "collection": {
        const nextCollection = target.dataset.collection;
        if (nextCollection !== "tam" && nextCollection !== "toeic-daily") return;
        if (collectionId === nextCollection) return;
        switchCollection(nextCollection);
        renderShell();
        root.querySelector<HTMLElement>(`[data-collection="${nextCollection}"]`)?.focus({ preventScroll: true });
        break;
      }
      case "practice-card": {
        const card = cardsById.get(target.dataset.cardId ?? "");
        if (!card) return;
        switchCollection(card.collectionId);
        deck.ids = [card.id, ...deck.ids.filter((id) => id !== card.id)];
        deck.position = 0;
        deck.currentId = card.id;
        window.location.hash = "#/drill";
        break;
      }
      case "reveal":
        answerVisible = true;
        renderDrillPanel('[data-action="next"]');
        break;
      case "hide-answer":
        answerVisible = false;
        renderDrillPanel('[data-action="reveal"]');
        break;
      case "next":
        showNextCard();
        renderDrillPanel("#drill-prompt");
        break;
      case "clear-draft": {
        if (deck.currentId) answerDrafts.delete(deck.currentId);
        const input = root.querySelector<HTMLTextAreaElement>("#answer-draft");
        if (input) {
          input.value = "";
          input.focus({ preventScroll: true });
        }
        break;
      }
    }
  }

  function handleChange(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.name === "session-review") {
      const { cardId } = event.target.dataset;
      if (!cardId || !cardsById.has(cardId)) return;
      if (event.target.checked) sessionReviewIds.add(cardId);
      else sessionReviewIds.delete(cardId);
      event.target.closest(".session-review-toggle")?.classList.toggle("is-marked", event.target.checked);
      const count = root.querySelector("#session-review-count");
      if (count) count.textContent = String(collectionCards().filter((card) => sessionReviewIds.has(card.id)).length);
      return;
    }
    if (!(event.target instanceof HTMLSelectElement)) return;
    const { name, value } = event.target;

    if (name === "glossary-tag") {
      glossaryTag = value;
      renderGlossaryResults();
      return;
    }

    if (name === "drill-pool") drillFilters.pool = value as DrillPool;
    if (name === "drill-theme") drillFilters.theme = value;
    if (name === "drill-difficulty") drillFilters.difficulty = value;
    if (name === "drill-source") drillFilters.source = value;
    if (name === "drill-order") drillFilters.order = value as DrillOrder;

    if (name.startsWith("drill-")) {
      resetDeck();
      renderDrillPanel("#drill-prompt");
      return;
    }

    if (name === "list-status") listFilters.status = value as StatusFilter;
    if (name === "list-theme") listFilters.theme = value;
    if (name === "list-difficulty") listFilters.difficulty = value;
    if (name === "list-source") listFilters.source = value;

    if (name.startsWith("list-")) renderListResults();
  }

  function handleInput(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement && event.target.name === "answer-draft") {
      const { cardId } = event.target.dataset;
      if (cardId && cardsById.has(cardId)) {
        if (event.target.value) answerDrafts.set(cardId, event.target.value);
        else answerDrafts.delete(cardId);
      }
      return;
    }
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.name === "card-search") {
      listFilters.query = event.target.value;
      renderListResults();
    }
    if (event.target.name === "glossary-search") {
      glossaryQuery = event.target.value;
      renderGlossaryResults();
    }
  }

  function handleHashChange(): void {
    if (window.location.hash === "#main-content") {
      root.querySelector<HTMLElement>("#main-content")?.focus();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#/${route}`,
      );
      return;
    }

    if (!isValidHash(window.location.hash)) return;
    const nextRoute = routeFromHash(window.location.hash);
    if (route === nextRoute && nextRoute !== "glossary") return;
    route = nextRoute;
    if (route === "glossary" && linkedTermId()) {
      glossaryQuery = "";
      glossaryTag = ALL;
    }
    answerVisible = false;
    renderShell();
    if (!focusLinkedTerm()) root.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
  }

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (route !== "drill" || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isInteractiveTarget(event.target)) return;

    if (event.key === " " && !answerVisible && deck.currentId) {
      event.preventDefault();
      answerVisible = true;
      renderDrillPanel();
    } else if (event.key === "ArrowRight" && deck.currentId) {
      event.preventDefault();
      showNextCard();
      renderDrillPanel("#drill-prompt");
    }
  }

  function renderDrillPanel(focusSelector?: string): void {
    const panel = root.querySelector<HTMLElement>("#drill-panel");
    if (!panel) return;
    panel.innerHTML = renderDrillPanelMarkup();
    if (focusSelector) panel.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
  }

  function renderListResults(): void {
    const results = filteredListCards();
    const resultsElement = root.querySelector<HTMLElement>("#list-results");
    const countElement = root.querySelector<HTMLElement>("#result-count");
    if (resultsElement) resultsElement.innerHTML = renderListResultsMarkup();
    if (countElement) countElement.textContent = String(results.length);
  }

  function renderGlossaryResults(): void {
    const resultsElement = root.querySelector<HTMLElement>("#glossary-results");
    const countElement = root.querySelector<HTMLElement>("#glossary-count");
    if (resultsElement) resultsElement.innerHTML = renderGlossaryResultsMarkup();
    if (countElement) countElement.textContent = String(filteredTerms().length);
  }

  function focusLinkedTerm(): boolean {
    const id = linkedTermId();
    if (!id || !terms.some((term) => term.id === id)) return false;
    const element = document.getElementById(`term-${id}`);
    if (!element || !root.contains(element)) return false;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start" });
    return true;
  }

  function switchCollection(nextCollection: CollectionId): void {
    collectionId = nextCollection;
    drillFilters = {
      pool: "all", theme: ALL, difficulty: ALL, source: ALL,
      order: nextCollection === "tam" ? "listed" : "random",
    };
    listFilters = { query: "", status: "all", theme: ALL, difficulty: ALL, source: ALL };
    resetDeck();
  }

  function filteredDrillCards(): StudyCard[] {
    return filterStudyCards(cards, collectionId, {
      status: drillFilters.pool === "session" ? "all" : drillFilters.pool,
      theme: drillFilters.theme === ALL ? undefined : drillFilters.theme,
      difficulty: difficultyFilter(drillFilters.difficulty),
      source: drillFilters.source === ALL ? undefined : drillFilters.source,
    }).filter((card) => drillFilters.pool !== "session" || sessionReviewIds.has(card.id));
  }

  function resetDeck(): void {
    const matchingCards = filteredDrillCards();
    const ids = createDrillQueue(matchingCards.map((card) => card.id), drillFilters.order);
    deck = { ids, position: 0, cycle: 1, currentId: ids[0] ?? null };
    answerVisible = false;
  }

  function showNextCard(): void {
    if (deck.ids.length === 0) return;
    const previousId = deck.currentId;

    if (drillFilters.pool === "session") {
      const eligible = new Set(filteredDrillCards().map((card) => card.id));
      const visited = deck.ids.slice(0, deck.position + 1).filter((id) => eligible.has(id));
      const remaining = deck.ids.slice(deck.position + 1).filter((id) => eligible.has(id));
      // Keep the current answer visible when a mark is removed; skip it on subsequent rounds.
      deck.ids = [...visited, ...remaining];
      deck.position = visited.length - 1;
      if (deck.ids.length === 0) {
        deck.currentId = null;
        answerVisible = false;
        return;
      }
    }

    if (deck.position + 1 < deck.ids.length) {
      deck.position += 1;
      deck.currentId = deck.ids[deck.position];
    } else {
      const nextIds = createDrillQueue(filteredDrillCards().map((card) => card.id), drillFilters.order, previousId);
      deck = { ids: nextIds, position: 0, cycle: deck.cycle + 1, currentId: nextIds[0] ?? null };
    }
    answerVisible = false;
  }

  function filteredListCards(): StudyCard[] {
    return filterStudyCards(cards, collectionId, {
      query: listFilters.query,
      status: listFilters.status === "session" ? "all" : listFilters.status,
      theme: listFilters.theme === ALL ? undefined : listFilters.theme,
      difficulty: difficultyFilter(listFilters.difficulty),
      source: listFilters.source === ALL ? undefined : listFilters.source,
    }).filter((card) => listFilters.status !== "session" || sessionReviewIds.has(card.id));
  }
}

export function renderFatalError(root: HTMLElement, message: string): void {
  root.innerHTML = `
    <main class="loading-shell error-shell">
      <p class="eyebrow">Data error</p>
      <h1>問題を読み込めませんでした</h1>
      <p>${escapeHtml(message)}</p>
      <button class="button button-primary" type="button" id="retry-load">再読み込み</button>
    </main>
  `;
  root.querySelector("#retry-load")?.addEventListener("click", () => window.location.reload());
}

function routeFromHash(hash: string): Route {
  if (hash === "#/glossary" || hash.startsWith("#/glossary/")) return "glossary";
  return hash === "#/list" ? "list" : "drill";
}

function isValidHash(hash: string): boolean {
  return /^#\/(drill|list|glossary)$/.test(hash) || /^#\/glossary\/[a-zA-Z0-9._-]+$/.test(hash);
}

function linkedTermId(): string | undefined {
  return /^#\/glossary\/([a-zA-Z0-9._-]+)$/.exec(window.location.hash)?.[1];
}

function difficultyFilter(value: string): Difficulty | "all" {
  if (value === ALL) return "all";
  if (value === UNSET) return null;
  return value as Exclude<Difficulty, null>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "ja"));
}

function option(value: string, label: string, selectedValue: string): string {
  return `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function statusBadge(status: DrillCard["reviewStatus"]): string {
  if (status === "review") return '<span class="badge badge-review">⭐ 要復習</span>';
  if (status === "mastered") return '<span class="badge badge-mastered">✓ 定着済み</span>';
  return '<span class="badge badge-regular">通常</span>';
}

function renderStringList(items: string[], emptyText: string, language?: string): string {
  if (items.length === 0) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  const lang = language ? ` lang="${escapeAttribute(language)}"` : "";
  return `<ul${lang}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "ローカルプレビュー";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, button, a, summary"));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
