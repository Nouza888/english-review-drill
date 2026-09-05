import type { Difficulty, DrillCard } from "../types";
import { createShuffledQueue, filterCards } from "../lib/cards";

type Route = "drill" | "list";
type DrillPool = "review" | "mastered" | "all";
type StatusFilter = "all" | "review" | "mastered" | "regular";

interface DrillFilters {
  pool: DrillPool;
  theme: string;
  difficulty: string;
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

export function mountApp(root: HTMLElement, cards: DrillCard[], generatedAt: string): void {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const themes = uniqueSorted(cards.map((card) => card.theme));
  const sources = uniqueSorted(cards.flatMap((card) => card.source));
  const difficulties = (["Easy", "Medium", "Hard"] as const).filter((difficulty) =>
    cards.some((card) => card.difficulty === difficulty),
  );
  const hasUnsetDifficulty = cards.some((card) => card.difficulty === null);

  let route = routeFromHash(window.location.hash);
  let answerVisible = false;
  let drillFilters: DrillFilters = { pool: "review", theme: ALL, difficulty: ALL };
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

  if (!window.location.hash || !/^#\/(drill|list)$/.test(window.location.hash)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/drill`);
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("keydown", handleKeyboardShortcut);

  function renderShell(): void {
    const reviewCount = cards.filter((card) => card.reviewStatus === "review").length;
    const masteredCount = cards.filter((card) => card.reviewStatus === "mastered").length;

    root.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="#/drill" aria-label="瞬発英語ドリル ホーム">
            <span class="brand-mark" aria-hidden="true">Aa</span>
            <span>
              <span class="eyebrow">Instant English</span>
              <span class="brand-title">瞬発英語ドリル</span>
            </span>
          </a>
          <nav class="primary-nav" aria-label="メインメニュー">
            <a href="#/drill" ${route === "drill" ? 'aria-current="page"' : ""}>ドリル</a>
            <a href="#/list" ${route === "list" ? 'aria-current="page"' : ""}>問題一覧</a>
          </nav>
        </div>
      </header>
      <main id="main-content" class="page-shell" tabindex="-1">
        <section class="page-heading" aria-labelledby="page-title">
          <div>
            <p class="eyebrow">${route === "drill" ? "Quick practice" : "Card library"}</p>
            <h1 id="page-title">${route === "drill" ? "英語を瞬発的に組み立てる" : "収録問題を探す"}</h1>
            <p>${route === "drill" ? "まず日本語から英文を考え、準備ができたら模範解答を確認します。" : "日本語・英語・フレーズを横断して検索できます。"}</p>
          </div>
          <dl class="summary-stats" aria-label="収録状況">
            <div><dt>全問題</dt><dd>${cards.length}</dd></div>
            <div><dt>要復習</dt><dd>${reviewCount}</dd></div>
            <div><dt>定着済み</dt><dd>${masteredCount}</dd></div>
          </dl>
        </section>
        ${route === "drill" ? renderDrillRoute() : renderListRoute()}
      </main>
      <footer class="site-footer">
        <span>個人用・端末内で動作</span>
        <span>データ更新: ${escapeHtml(formatDate(generatedAt))}</span>
      </footer>
    `;
  }

  function renderDrillRoute(): string {
    return `
      <section class="workspace" aria-label="ドリル">
        <div class="filter-bar drill-filters" aria-label="出題条件">
          <label>
            <span>出題範囲</span>
            <select name="drill-pool">
              ${option("review", "⭐ 要復習", drillFilters.pool)}
              ${option("all", "全問題", drillFilters.pool)}
              ${option("mastered", "✓ 定着済み", drillFilters.pool)}
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
          <h2>条件に合う問題がありません</h2>
          <p>出題範囲またはフィルターを変更してください。</p>
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
        ${answerVisible ? renderAnswer(currentCard) : '<div class="thinking-space" aria-hidden="true"><span></span><span></span><span></span></div>'}
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

  function renderAnswer(card: DrillCard): string {
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
      </section>
    `;
  }

  function renderListRoute(): string {
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
            </div>
          </details>
        `,
      )
      .join("");
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
    if (!target) return;

    switch (target.dataset.action) {
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
    }
  }

  function handleChange(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const { name, value } = event.target;

    if (name === "drill-pool") drillFilters.pool = value as DrillPool;
    if (name === "drill-theme") drillFilters.theme = value;
    if (name === "drill-difficulty") drillFilters.difficulty = value;

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
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== "card-search") return;
    listFilters.query = event.target.value;
    renderListResults();
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

    if (!/^#\/(drill|list)$/.test(window.location.hash)) return;
    const nextRoute = routeFromHash(window.location.hash);
    if (route === nextRoute) return;
    route = nextRoute;
    answerVisible = false;
    renderShell();
    root.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
  }

  function handleKeyboardShortcut(event: KeyboardEvent): void {
    if (route !== "drill" || event.metaKey || event.ctrlKey || event.altKey) return;
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

  function resetDeck(): void {
    const matchingCards = filterCards(cards, {
      status: drillFilters.pool,
      theme: drillFilters.theme === ALL ? undefined : drillFilters.theme,
      difficulty: difficultyFilter(drillFilters.difficulty),
    });
    const ids = createShuffledQueue(matchingCards.map((card) => card.id));
    deck = { ids, position: 0, cycle: 1, currentId: ids[0] ?? null };
    answerVisible = false;
  }

  function showNextCard(): void {
    if (deck.ids.length === 0) return;
    const previousId = deck.currentId;

    if (deck.position + 1 < deck.ids.length) {
      deck.position += 1;
      deck.currentId = deck.ids[deck.position];
    } else {
      const nextIds = createShuffledQueue(deck.ids);
      if (nextIds.length > 1 && nextIds[0] === previousId) {
        [nextIds[0], nextIds[1]] = [nextIds[1], nextIds[0]];
      }
      deck = { ids: nextIds, position: 0, cycle: deck.cycle + 1, currentId: nextIds[0] ?? null };
    }
    answerVisible = false;
  }

  function filteredListCards(): DrillCard[] {
    return filterCards(cards, {
      query: listFilters.query,
      status: listFilters.status,
      theme: listFilters.theme === ALL ? undefined : listFilters.theme,
      difficulty: difficultyFilter(listFilters.difficulty),
      source: listFilters.source === ALL ? undefined : listFilters.source,
    });
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
  return hash === "#/list" ? "list" : "drill";
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
