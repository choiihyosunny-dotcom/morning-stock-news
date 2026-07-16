import { readFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);
const SITE_URL = "https://choiihyosunny-dotcom.github.io/morning-stock-news/";

async function main() {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log("NTFY_TOPIC not set, skipping notification.");
    return;
  }

  const market = JSON.parse(await readFile(new URL("market.json", DATA_DIR), "utf-8"));
  const news = JSON.parse(await readFile(new URL("news.json", DATA_DIR), "utf-8"));

  const indexLine = (market.indices || [])
    .map((idx) => {
      const sign = idx.changePercent > 0 ? "+" : "";
      const arrow = idx.changePercent > 0 ? "▲" : idx.changePercent < 0 ? "▼" : "-";
      return `${idx.name} ${idx.value.toLocaleString("ko-KR")} ${arrow}${sign}${idx.changePercent.toFixed(2)}%`;
    })
    .join("  |  ");

  const topHeadline = news.items && news.items[0] ? news.items[0].title : "";

  const body = [indexLine, topHeadline ? `\n${topHeadline}` : ""].filter(Boolean).join("\n");

  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      Title: toHeaderSafe("모닝 주식 브리핑"),
      Tags: "chart_with_upwards_trend",
      Click: SITE_URL,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`ntfy push failed: ${res.status} ${await res.text()}`);
  }
  console.log("Notification sent.");
}

// HTTP header values must be Latin-1; map each UTF-8 byte to one char code
// so the raw UTF-8 bytes reach ntfy untouched (RFC 2047 is not decoded by ntfy).
function toHeaderSafe(str) {
  const buf = Buffer.from(str, "utf-8");
  let out = "";
  for (const b of buf) out += String.fromCharCode(b);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
