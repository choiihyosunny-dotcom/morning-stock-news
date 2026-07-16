# 모닝 주식 브리핑

매일 아침 코스피/코스닥 시황과 국내 증시 뉴스를 정리해서 보여주는 정적 웹앱입니다.

- `data/market.json`, `data/news.json`: GitHub Actions(`.github/workflows/daily-update.yml`)가 매일 07:00(KST)에 자동으로 갱신합니다.
- 관심 종목은 로그인 없이 브라우저(localStorage)에 저장되며, 각자 원하는 종목을 앱에서 직접 검색해 추가합니다.
- 관심 종목 뉴스는 접속 시점에 Google 뉴스 검색 결과를 실시간으로 불러옵니다.

## 배포

GitHub Pages(Settings → Pages → Source: `main` 브랜치, `/ (root)`)로 서빙됩니다.

## 수동 갱신

Actions 탭 → "Daily market update" → Run workflow 로 즉시 갱신할 수 있습니다.
