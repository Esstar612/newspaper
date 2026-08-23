# 📰 The Newspaper

> A modern, full-stack news aggregation platform with real-time weather forecasts and stock market data. Built with Next.js 16, TypeScript, and MongoDB.

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green?style=flat-square&logo=mongodb)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

[Live Demo](https://newspaper-kohl.vercel.app) | [Report Bug](https://github.com/Esstar612/newspaper/issues) | [Request Feature](https://github.com/Esstar612/newspaper/issues)

---

## ✨ Features

### 📰 Multi-Source News Aggregation
- Headlines from **The New York Times** and the **BBC**, via their public RSS feeds — no API keys, no rate limits
- ~450 articles pulled daily across **11 per-section feeds**, deduplicated to ~400 unique
- Automatic daily ingestion via cron
- Full-text search and cursor-based pagination
- **Seven sections**, where the feed requested *is* the category:
  - Top Stories · World · Business · Technology · Science · Health · Sports

### 🎨 Editorial Interface
- Serif headlines (Newsreader) over a sans UI (Geist), with a real type scale
- Three article weights — lead, feature, and an "In brief" column set — so a page of stories reads as a front page rather than a grid
- **Light and dark themes**, following your OS by default and remembering your choice
- Every colour routed through CSS custom properties; all text clears **WCAG AA** contrast in both themes
- Keyboard-navigable tabs, visible focus rings, and `prefers-reduced-motion` support

### 🌤️ Weather Dashboard
- Real-time weather data from OpenWeatherMap
- 5-day forecast with hourly breakdowns
- Interactive visualizations using **Recharts**:
  - Temperature bar charts
  - Humidity line graphs
  - Weather condition pie charts
- Location autocomplete with geocoding
- Geolocation support for automatic location detection

### 📈 Markets
- A ten-symbol watchlist and an interactive price chart, both loading on arrival
- **Price history is served from MongoDB**, written once a day by a cron — the chart never calls a third-party API and so cannot be blocked by one
- Quotes cached client- and server-side: repeat visits render instantly and issue **no network request at all**
- Currency conversion into 30+ currencies via Frankfurter
- Prices are delayed, and the UI says so rather than claiming otherwise

### 🤖 Automated Data Management
- **Three cron jobs**: news ingestion, price-history refresh, and database cleanup
- URL-normalised deduplication that *merges* categories, so an article appearing in two feeds keeps both
- Cleanup that refuses to run when ingest has stopped, so a broken feed can never empty the site
- Compound MongoDB indexes on the fields actually queried

---

## 🚀 Demo

![Front page](docs/screenshots/landing.png)
*Front page — masthead, markets ticker, lead story and headline grid*

![News](docs/screenshots/news.png)
*Seven sections, with a lead story above a feature grid*

![Markets](docs/screenshots/stocks.png)
*Watchlist and price chart, both loading on arrival*

![Weather](docs/screenshots/weather.png)
*Current conditions and a five-day forecast with Recharts visualisations*

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16** (App Router, React Server Components)
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Data visualization library

### Backend
- **Next.js API Routes** - Serverless functions
- **MongoDB Atlas** - Cloud database
- **Mongoose** - ODM for MongoDB

### APIs & Services
- **NYT & BBC RSS** - News headlines (keyless, no rate limit)
- **OpenWeatherMap** - Weather, forecast, and both forward and reverse geocoding
- **Market Data** - Stock quotes and daily candles
- **Frankfurter** - Currency conversion
- **NewsAPI** - Optional, development only (its free tier rejects deployed origins)

### DevOps
- **Vercel** - Deployment and hosting
- **Vercel Cron Jobs** - Scheduled tasks
- **GitHub Actions** - CI/CD (optional)

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **MongoDB Atlas** account (free tier works!)
- API keys for:
  - [OpenWeatherMap](https://openweathermap.org/api) — weather and geocoding
  - [Market Data](https://www.marketdata.app/) — stock quotes and history

News needs **no key at all**: it reads public RSS feeds. `NEWS_API_KEY` and `NYT_API_KEY` are optional and used only by the development-only manual ingest.

---

## ⚡ Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Esstar612/newspaper.git
cd newspaper
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root directory:

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/newspaper

# News APIs — optional; the RSS pipeline needs neither.
# Used only by the dev-only manual ingest at /api/admin/ingest-news.
NEWS_API_KEY=your_newsapi_key
NYT_API_KEY=your_nyt_api_key

# Weather API
WEATHER_API_KEY=your_openweather_key

# Stock Market API
MARKET_DATA_API_TOKEN=your_market_data_key

# Cron security (optional, but the cron endpoints are open without it)
CRON_SECRET=your_secret_key_here

# Guards the one-off admin backfill routes
ADMIN_INGEST_TOKEN=your_admin_token_here
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for production

```bash
npm run build
npm start
```

---

## 🗄️ Database Schema

### Article Model

```typescript
{
  title: String,           // Article headline
  description: String,     // Article summary
  url: String,            // Article URL (unique)
  imageUrl: String,       // Featured image
  source: String,         // News source (NYT, NewsAPI, etc.)
  publishedAt: Date,      // Publication date
  providerId: String,     // Source-specific ID
  createdAt: Date,        // Auto-generated
  updatedAt: Date         // Auto-generated
}
```

Plus `tags: [String]` — the category or categories the article was ingested under. A story appearing in two feeds keeps both.

### CandleSeries Model

```typescript
{
  symbol: String,          // one document per symbol
  points: [{ t, close }],  // ~250 daily closes, epoch ms
  fetchedAt: Date          // surfaced in the UI as "as of"
}
```

One stored year serves every chart range, so 1M/3M/6M/1Y are slices of the same document rather than four separate lookups.

### Indexes
- `url`: unique, for deduplication
- `publishedAt`: sorted feed queries
- `source + publishedAt`: filtered sorted queries
- `tags + publishedAt`: category tabs, which would otherwise be a collection scan
- `symbol`: unique, on CandleSeries

---

## 🔄 Cron Jobs

Three scheduled jobs keep the data current. Vercel's Hobby plan allows one run per
day each, with up to ±59 minutes of scheduling jitter.

### News ingestion — `0 0 * * *`
Fetches **11 per-section RSS feeds** in parallel (NYT world/business/technology/science/health,
BBC the same five, plus BBC Sport). The feed requested *is* the category, so no
guessing is involved. Roughly 450 articles pulled, ~400 unique after
URL-normalised deduplication that merges categories rather than overwriting them.

Per-feed counts are returned in the response, so a feed that dies is visible
rather than silently producing an empty section.

### Price history — `0 2 * * *`
Fetches a year of daily closes for all ten symbols and upserts them into MongoDB.
Deliberately **sequential**: a single cron invocation runs in one serverless
function with one outbound IP, which is what the data provider's licence requires
(see [Architecture notes](#-architecture-notes)).

### Database cleanup — `0 3 * * *`
Deletes articles older than seven days — but never at the cost of emptying the
site. It holds if nothing has been ingested for 48 hours, and never drops below a
120-article floor. Cron delivery is best-effort with no retries, so a naive age
cutoff would empty the database within a week of ingest breaking.

## 📊 API Usage & Costs

| Service | Daily usage | Free limit | Notes |
|---|---|---|---|
| NYT / BBC RSS | 11 requests | none | Keyless, unmetered |
| Market Data — quotes | ~288 max | 100 credits | Bulk quotes are **billed at zero** |
| Market Data — candles | 10 | 100 credits | One per symbol, once daily |
| OpenWeatherMap | On demand | 1,000 | Weather, forecast, geocoding |
| Frankfurter | On demand | none | Keyless |

Quote requests are capped by a five-minute server-side cache, so traffic volume
does not change the upstream request count.

**Total cost: $0/month** 🎉

## 🎨 Features Breakdown

### News Page
- **Search**: full-text across titles and descriptions, scoped to the active section
- **Sections**: seven tabs, with the active one held in the URL so a refresh or a shared link lands in the same place
- **Pagination**: compound cursor over `publishedAt` + `_id`, so ties at a page boundary neither skip nor repeat articles
- **Hierarchy**: a lead story, a feature grid, then an "In brief" column set

### Weather Page
- **Current Weather**: Temperature, conditions, humidity
- **5-Day Forecast**: Detailed hourly predictions
- **Location Search**: Autocomplete city search
- **Geolocation**: Automatic location detection
- **Visualizations**:
  - Temperature trends (bar chart)
  - Humidity patterns (line chart)
  - Weather distribution (pie chart)

### Markets Page
- **Watchlist**: ten symbols in one bulk request, cached so revisits fetch nothing
- **Price chart**: 1M/3M/6M/1Y, served from MongoDB rather than a live API
- **Currency conversion**: 30+ currencies, applied to both the quote and the chart
- **Honest states**: when quotes are unavailable the page says so and offers a retry; the chart keeps working regardless, because its data is local

---

## 🚀 Deployment

### Deploy to Vercel

1. **Fork this repository**

2. **Import to Vercel**
  - Go to [vercel.com/new](https://vercel.com/new)
  - Import your forked repository
  - Vercel will auto-detect Next.js

3. **Add Environment Variables**
  - Go to Project Settings → Environment Variables
  - Add all keys from `.env.local`

4. **Deploy**
  - Click "Deploy"
  - Your app will be live in ~2 minutes!

5. **Verify Cron Jobs**
  - Go to Project Settings → Crons
  - You should see 3 cron jobs listed

6. **Populate price history**
  - The chart reads from MongoDB, which starts empty
  - Either wait for the 02:00 UTC cron, or trigger it once:
    ```bash
    curl -X POST -H "Authorization: Bearer $ADMIN_INGEST_TOKEN" \
      https://your-app.vercel.app/api/admin/backfill-candles
    ```

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

---

## 🧪 Verifying it works

There is no test runner configured. Type checking and linting are the automated
checks, plus these endpoints for a quick smoke test:

```bash
npx tsc --noEmit     # type check
npm run lint         # eslint
```

### Test specific API routes
```bash
# Test news ingestion
curl http://localhost:3000/api/cron/ingest-news

# Test weather API
curl http://localhost:3000/api/weather?q=London

# Stock quotes (all ten symbols, one request)
curl http://localhost:3000/api/stocks/watchlist

# Price history, straight from MongoDB
curl "http://localhost:3000/api/stocks/AAPL/candles?range=3m"

# Populate price history immediately, rather than waiting for the 02:00 UTC cron
curl -X POST -H "Authorization: Bearer $ADMIN_INGEST_TOKEN" \
  http://localhost:3000/api/admin/backfill-candles

# Health check
curl http://localhost:3000/api/health
```

> **Note:** `.env.local` points at your production database. Running the app
> locally reads and writes live data.

---

## 📁 Project Structure

```
newspaper/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── backfill-candles/   # One-off price-history populate
│   │   │   ├── backfill-tags/      # One-off category repair
│   │   │   └── ingest-news/        # Manual ingest (dev only)
│   │   ├── cron/
│   │   │   ├── ingest-news/        # Daily RSS ingestion
│   │   │   ├── refresh-candles/    # Daily price history -> MongoDB
│   │   │   └── cleanup-old-news/   # Guarded retention cleanup
│   │   ├── currencies/             # Cached currency list
│   │   ├── forecast/               # 5-day forecast
│   │   ├── geocoding/              # Forward + reverse geocoding
│   │   ├── health/                 # DB connectivity + article count
│   │   ├── news/                   # Feed, search, cursor pagination
│   │   ├── stocks/
│   │   │   ├── watchlist/          # All symbols, one cached request
│   │   │   └── [symbol]/
│   │   │       ├── candles/        # History, read from MongoDB
│   │   │       └── route.ts        # Single quote
│   │   └── weather/                # Current conditions
│   ├── news/ · stocks/ · weather/  # Pages
│   ├── layout.tsx                  # Fonts, theme script
│   ├── globals.css                 # Design tokens, both themes
│   └── page.tsx                    # Front page
├── components/
│   ├── ui/                         # Card, Button, Field, Icon, states
│   ├── ArticleCard.tsx             # lead / feature / compact variants
│   ├── ArticleThumb.tsx            # Client island for image fallback
│   ├── Header.tsx · ThemeToggle.tsx
│   ├── MarketsStrip.tsx            # Front-page ticker
│   ├── PriceChart.tsx              # Recharts price history
│   └── *Graph.tsx / *Chart.tsx     # Weather visualisations
├── lib/
│   ├── categories.ts               # Shared section definitions
│   ├── cleanup.ts                  # Pure retention decision (testable)
│   ├── db.ts                       # Cached Mongoose connection
│   ├── feeds.ts                    # RSS table, parsing, dedupe
│   ├── format.ts                   # Dates, money, truncation
│   ├── stocks.ts                   # Symbols, quotes, candles, ranges
│   └── useQuotes.ts                # Cached-first quote hook
├── models/
│   ├── Article.ts
│   └── CandleSeries.ts
├── vercel.json                     # Three cron schedules
└── tailwind.config.js              # Tokens, type scale, fonts
```

---

## 🏗 Architecture notes

A few decisions worth explaining, since they were driven by real constraints
rather than preference.

**News uses RSS, not a news API.** The original build used NewsAPI and the NYT
Top Stories API. NewsAPI's free tier rejects requests from deployed origins, so
it silently contributed nothing in production. The NYT API allows five requests
per minute and answers overflow with `HTTP 200` and a `{"fault": …}` body, so
failures looked like empty results. Per-section RSS has neither problem, needs no
key, and the feed requested *is* the category — the exact signal the API version
had to guess at.

**Price history lives in MongoDB.** The market data provider permits one active
IP per account and states that serverless platforms are unsupported, because
rotating outbound IPs look like multiple devices. Fetching history per request
meant forty upstream calls from scattered IPs. A daily cron makes ten sequential
calls from a single invocation — one IP — and every chart read is then a local
database query.

**Quotes are cached at three levels.** A five-minute server-side route cache
(matching the provider's block window), a `localStorage` cache shared by the
ticker and the watchlist, and a stale-payload fallback so a provider outage shows
the last known prices rather than an empty page.

**Cleanup can refuse to run.** Retention and ingestion are separate jobs, and
cron delivery is best-effort. A plain age cutoff would empty the database within
a week of ingest breaking, so cleanup holds when nothing is arriving and never
drops below a floor.

---

## 🤝 Contributing

Contributions are what make the open-source community amazing! Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🐛 Known Issues

- **Live quotes can be briefly unavailable.** The market data provider allows one
  active IP per account and does not support serverless platforms, so a Vercel
  deployment occasionally trips a five-minute block. Quotes degrade to the last
  known prices and say so; the chart is unaffected, since its data is local.
- **Cron timing is approximate.** Vercel's Hobby plan runs jobs once per day with
  up to ±59 minutes of jitter.
- **Prices are delayed**, not real-time — a free-tier limitation, stated in the UI.
- `PROJECT_SUMMARY.md` predates several routes and is out of date; this README is
  the current reference.

See [open issues](https://github.com/Esstar612/newspaper/issues) for a full list of known issues.

---

## 🔮 Roadmap

- [x] Dark/light theme toggle
- [ ] User authentication and personalization
- [ ] Bookmarking and reading lists
- [ ] Email notifications for breaking news
- [ ] Mobile app (React Native)
- [ ] Advanced search filters
- [ ] Social sharing features
- [ ] RSS feed generation
- [ ] Multi-language support

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 👤 Author

**Star Olaojo**

- GitHub: [@Esstar612](https://github.com/Esstar612)
- LinkedIn: [Star Olaojo](https://linkedin.com/in/star-olaojo/)
- Portfolio: [https://esstar612.github.io/my_portfolio/](https://esstar612.github.io/my_portfolio/)

---

## 🙏 Acknowledgments

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Platform](https://vercel.com)
- [The New York Times](https://www.nytimes.com/) and [BBC News](https://www.bbc.co.uk/news) RSS feeds
- [OpenWeatherMap](https://openweathermap.org/)
- [Frankfurter](https://frankfurter.dev/)
- [Recharts](https://recharts.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## ⭐ Show your support

Give a ⭐️ if this project helped you!

---

## 📧 Contact

Project Link: [https://github.com/Esstar612/newspaper](https://github.com/Esstar612/newspaper)

Live Demo: [https://newspaper-kohl.vercel.app](https://newspaper-kohl.vercel.app)

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/Esstar612">Star Olaojo</a>
</div>