const WATCHLIST_KEY = "morning-stock-news:watchlist";
const READER_PROXY = "https://r.jina.ai/";

const SUGGESTIONS = [
  "삼성전자", "SK하이닉스", "LG에너지솔루션", "삼성바이오로직스", "현대차",
  "기아", "셀트리온", "NAVER", "카카오", "POSCO홀딩스",
  "LG화학", "삼성SDI", "KB금융", "신한지주", "한화에어로스페이스",
  "HD현대중공업", "두산에너빌리티", "SK이노베이션", "크래프톤", "하이브"
];

const KEYWORD_STOPWORDS = new Set([
  "속보", "단독", "종합", "업데이트", "오늘", "내일", "전망", "관련", "이슈", "분석", "현황",
  "이번", "지난", "최근", "한편", "이후", "이전", "위해", "통해", "대한", "대해", "것",
  "때문", "보다", "부터", "까지", "에서", "으로", "에게", "한테", "이라며", "라며",
  "이라고", "라고", "한다", "했다", "된다", "됐다", "이다", "였다", "있다", "없다",
  "한다면", "하는", "했던", "하며", "하고", "해서", "같은", "위한", "따라", "새로운",
]);

function extractKeywords(title, max = 3) {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/[…·↓↑]/g, " ")
    .replace(/\.{2,}/g, " ");
  const tokens = cleaned.split(/[\s,\-–—:()]+/).filter(Boolean);
  const seen = new Set();
  const picked = [];
  for (const raw of tokens) {
    const t = raw.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9%]+$/g, "");
    if (t.length < 2 || KEYWORD_STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    picked.push(t);
  }
  return picked.sort((a, b) => b.length - a.length).slice(0, max);
}

function newsItemHtml(item) {
  const keywords = item.keywords && item.keywords.length ? item.keywords : extractKeywords(item.title);
  const tagsHtml = keywords.length
    ? `<span class="keyword-tags">${keywords.map((k) => `<span class="keyword-tag">#${k}</span>`).join("")}</span>`
    : "";
  return `
    <li>
      <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      <span class="news-meta">${item.source || ""}${item.pubDate ? " · " + item.pubDate : ""}</span>
      ${tagsHtml}
    </li>`;
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

function formatUpdatedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 기준`;
}

function renderIndexGrid(market) {
  const grid = document.getElementById("indexGrid");
  const indices = market && market.indices ? market.indices : [];

  if (!indices.length) {
    grid.innerHTML = `<div class="empty-state">지수 데이터를 불러오지 못했습니다.</div>`;
    return;
  }

  grid.innerHTML = indices
    .map((idx) => {
      const dir = idx.changePercent > 0 ? "up" : idx.changePercent < 0 ? "down" : "flat";
      const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "-";
      const sign = idx.changePercent > 0 ? "+" : "";
      return `
        <div class="index-item">
          <div class="name">${idx.name}</div>
          <div class="value">${idx.value != null ? idx.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "-"}</div>
          <div class="change ${dir}">${arrow} ${idx.change != null ? Math.abs(idx.change).toFixed(2) : "-"} (${sign}${idx.changePercent != null ? idx.changePercent.toFixed(2) : "-"}%)</div>
        </div>`;
    })
    .join("");
}

function renderMarketNews(news) {
  const list = document.getElementById("marketNews");
  if (!news || !news.length) {
    list.innerHTML = `<li class="empty-state">뉴스를 불러오지 못했습니다.</li>`;
    return;
  }
  list.innerHTML = news.map(newsItemHtml).join("");
}

function renderMovers(movers) {
  const list = document.getElementById("moversList");
  if (!movers || !movers.length) {
    list.innerHTML = `<li class="empty-state">급등주 데이터를 불러오지 못했습니다.</li>`;
    return;
  }
  list.innerHTML = movers
    .map(
      (m) => `
      <li class="mover-item">
        <a href="https://finance.naver.com/item/main.naver?code=${m.code}" target="_blank" rel="noopener noreferrer">
          <span class="mover-name">${m.name}</span>
          <span class="mover-market">${m.market}</span>
        </a>
        <span class="mover-price">${m.price.toLocaleString("ko-KR")}원</span>
        <span class="mover-change up">▲ ${m.changePercent.toFixed(2)}%</span>
      </li>`
    )
    .join("");
}

function renderChips(watchlist) {
  const chips = document.getElementById("watchlistChips");
  if (!watchlist.length) {
    chips.innerHTML = "";
    return;
  }
  chips.innerHTML = watchlist
    .map(
      (name) => `
      <span class="chip" data-name="${name}">
        ${name}
        <button type="button" aria-label="삭제" data-remove="${name}">✕</button>
      </span>`
    )
    .join("");

  chips.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-remove");
      const updated = loadWatchlist().filter((n) => n !== name);
      saveWatchlist(updated);
      renderChips(updated);
      renderWatchlistNews(updated);
    });
  });
}

function parseReaderMarkdown(text, limit = 5) {
  const re = /### \[([^\]]+)\]\((https:\/\/news\.google\.com\/rss\/articles\/[^\)]+)\)[\s\S]*?\n\n([A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}[^\n]*)/g;
  const items = [];
  let m;
  while ((m = re.exec(text)) && items.length < limit) {
    const [, rawTitle, link, pubDateRaw] = m;
    const parts = rawTitle.split(" - ");
    const source = parts.length > 1 ? parts.pop().trim() : "Google 뉴스";
    const title = parts.join(" - ").trim();
    let pubDate = "";
    const d = new Date(pubDateRaw);
    if (!isNaN(d)) pubDate = `${d.getMonth() + 1}.${d.getDate()}`;
    items.push({ title, link, source, pubDate, keywords: extractKeywords(title) });
  }
  return items;
}

async function fetchStockNews(name, attempt = 1) {
  const query = encodeURIComponent(`${name} 주가`);
  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(READER_PROXY + rssUrl);
    if (!res.ok) throw new Error("news fetch failed");
    const text = await res.text();
    return parseReaderMarkdown(text);
  } catch (err) {
    if (attempt >= 3) throw err;
    await new Promise((r) => setTimeout(r, 800 * attempt));
    return fetchStockNews(name, attempt + 1);
  }
}

async function renderWatchlistNews(watchlist) {
  const container = document.getElementById("watchlistNewsContainer");
  if (!watchlist.length) {
    container.innerHTML = `<p class="empty-state">아직 등록된 관심 종목이 없습니다. 위에서 종목명을 검색해 추가해보세요.</p>`;
    return;
  }

  container.innerHTML = watchlist
    .map(
      (name) => `
      <div class="stock-block" data-stock="${name}">
        <h3>${name}</h3>
        <ul class="stock-news-list"><li class="loading-state">뉴스를 불러오는 중…</li></ul>
      </div>`
    )
    .join("");

  for (const name of watchlist) {
    const block = container.querySelector(`.stock-block[data-stock="${CSS.escape(name)}"] .stock-news-list`);
    try {
      const items = await fetchStockNews(name);
      block.innerHTML = items.length
        ? items.map(newsItemHtml).join("")
        : `<li class="empty-state">관련 뉴스를 찾지 못했습니다.</li>`;
    } catch {
      block.innerHTML = `<li class="error-state">뉴스를 불러오지 못했습니다. 잠시 후 새로고침 해보세요.</li>`;
    }
  }
}

function initWatchlistForm() {
  const form = document.getElementById("watchlistForm");
  const input = document.getElementById("watchlistInput");
  const datalist = document.getElementById("stockSuggestions");

  datalist.innerHTML = SUGGESTIONS.map((s) => `<option value="${s}"></option>`).join("");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const list = loadWatchlist();
    if (list.includes(name)) {
      input.value = "";
      return;
    }
    const updated = [...list, name];
    saveWatchlist(updated);
    input.value = "";
    renderChips(updated);
    renderWatchlistNews(updated);
  });
}

async function loadData(path) {
  const res = await fetch(`${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`failed to load ${path}`);
  return res.json();
}

async function init() {
  initWatchlistForm();

  const watchlist = loadWatchlist();
  renderChips(watchlist);
  renderWatchlistNews(watchlist);

  try {
    const market = await loadData("data/market.json");
    document.getElementById("updatedAt").textContent = formatUpdatedAt(market.updatedAt);
    renderIndexGrid(market);
  } catch {
    document.getElementById("indexGrid").innerHTML = `<div class="empty-state">지수 데이터를 불러오지 못했습니다.</div>`;
  }

  try {
    const news = await loadData("data/news.json");
    renderMarketNews(news.items);
  } catch {
    document.getElementById("marketNews").innerHTML = `<li class="empty-state">뉴스를 불러오지 못했습니다.</li>`;
  }

  try {
    const movers = await loadData("data/movers.json");
    renderMovers(movers.items);
  } catch {
    document.getElementById("moversList").innerHTML = `<li class="empty-state">급등주 데이터를 불러오지 못했습니다.</li>`;
  }
}

init();
