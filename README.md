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
- Real-time news from **NewsAPI** and **New York Times**
- Automatic daily updates via cron jobs
- Search and filter by source, keywords, or date
- **400+ articles daily** across 6 categories:
  - Business
  - Technology
  - World News
  - Science
  - Health
  - Sports

### 🌤️ Weather Dashboard
- Real-time weather data from OpenWeatherMap
- 5-day forecast with hourly breakdowns
- Interactive visualizations using **Recharts**:
  - Temperature bar charts
  - Humidity line graphs
  - Weather condition pie charts
- Location autocomplete with geocoding
- Geolocation support for automatic location detection

### 📈 Stock Market Data
- Real-time stock prices via Market Data API
- Support for major stock symbols (AAPL, GOOGL, TSLA, etc.)
- Multi-currency conversion (USD, EUR, GBP, JPY, etc.)
- Clean, responsive card-based interface

### 🤖 Automated Data Management
- **Cron jobs** for automatic news ingestion (daily at midnight UTC)
- **Database cleanup** to maintain optimal performance (7-day retention)
- Smart deduplication to prevent duplicate articles
- Efficient MongoDB indexing for fast queries

---

## 🚀 Demo

![Landing Page](docs/screenshots/landing.png)
*Modern landing page with feature cards and smooth animations*

![News Feed](docs/screenshots/news.png)
*Searchable news feed with category filtering*

![Weather Dashboard](docs/screenshots/weather.png)
*Interactive weather dashboard with data visualizations*

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
- **NewsAPI** - News headlines
- **New York Times API** - Premium news content
- **OpenWeatherMap API** - Weather data
- **Market Data API** - Stock market data
- **Frankfurter API** - Currency conversion
- **BigDataCloud API** - Geolocation

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
  - [NewsAPI](https://newsapi.org/)
  - [New York Times](https://developer.nytimes.com/)
  - [OpenWeatherMap](https://openweathermap.org/api)
  - [Market Data](https://www.marketdata.app/)

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

# News APIs
NEWS_API_KEY=your_newsapi_key
NYT_API_KEY=your_nyt_api_key

# Weather API
OPENWEATHER_API_KEY=your_openweather_key

# Stock Market API
MARKET_DATA_API_KEY=your_market_data_key

# Cron Security (optional but recommended)
CRON_SECRET=your_secret_key_here
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

### Indexes
- `url`: Unique index for deduplication
- `publishedAt`: Sorted queries
- `source + publishedAt`: Filtered sorted queries

---

## 🔄 Cron Jobs

The app uses Vercel Cron Jobs to automate data management:

### News Ingestion (`0 0 * * *` - Daily at midnight UTC)
```typescript
// Fetches from multiple sources
- NewsAPI: 100 articles
- NYT Business: 50 articles
- NYT Technology: 50 articles
- NYT World: 50 articles
- NYT Science: 50 articles
- NYT Health: 50 articles
- NYT Sports: 50 articles
// Total: ~400 articles/day
```

### Database Cleanup (`0 3 * * *` - Daily at 3 AM UTC)
```typescript
// Maintains optimal database size
- Removes articles older than 7 days
- Keeps ~14,000 articles max
- Database size: ~14 MB
```

---

## 📊 API Usage & Costs

All APIs are used within **free tier limits**:

| API | Daily Usage | Free Limit | % Used |
|-----|-------------|------------|--------|
| NewsAPI | 1 call | 100 calls | 1% |
| NYT API | 6 calls | 500 calls | 1.2% |
| OpenWeatherMap | On-demand | 1,000 calls | Variable |
| Market Data | On-demand | 100 calls | Variable |

**Total Cost: $0/month** 🎉

---

## 🎨 Features Breakdown

### News Page
- **Search**: Full-text search across titles and descriptions
- **Filters**: Filter by news source (NewsAPI, NYT, etc.)
- **Pagination**: Cursor-based pagination for infinite scroll
- **Responsive Cards**: Beautiful article cards with images
- **External Links**: Direct links to original articles

### Weather Page
- **Current Weather**: Temperature, conditions, humidity
- **5-Day Forecast**: Detailed hourly predictions
- **Location Search**: Autocomplete city search
- **Geolocation**: Automatic location detection
- **Visualizations**:
  - Temperature trends (bar chart)
  - Humidity patterns (line chart)
  - Weather distribution (pie chart)

### Stocks Page
- **Real-Time Prices**: Live stock market data
- **Currency Conversion**: Convert to 30+ currencies
- **Popular Stocks**: Quick access to major symbols
- **Clean UI**: Simple, readable design

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
  - You should see 2 cron jobs listed

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

---

## 🧪 Testing

### Run all tests
```bash
npm test
```

### Test specific API routes
```bash
# Test news ingestion
curl http://localhost:3000/api/cron/ingest-news

# Test weather API
curl http://localhost:3000/api/weather?q=London

# Test stock API
curl http://localhost:3000/api/stocks/AAPL
```

---

## 📁 Project Structure

```
newspaper/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   └── ingest-news/      # Manual news ingestion
│   │   ├── cron/
│   │   │   ├── ingest-news/      # Automated news fetch
│   │   │   └── cleanup-old-news/ # Database cleanup
│   │   ├── forecast/             # Weather forecast
│   │   ├── geocoding/            # Location search
│   │   ├── news/                 # News feed API
│   │   ├── stocks/[symbol]/      # Stock data
│   │   └── weather/              # Current weather
│   ├── news/                     # News page
│   ├── stocks/                   # Stocks page
│   ├── weather/                  # Weather page
│   └── page.tsx                  # Landing page
├── components/
│   ├── ArticleCard.tsx           # News article card
│   ├── Header.tsx                # Navigation header
│   ├── TemperatureBarGraph.tsx   # Weather chart
│   ├── HumidityLineGraph.tsx     # Weather chart
│   └── WeatherPieChart.tsx       # Weather chart
├── lib/
│   └── db.ts                     # MongoDB connection
├── models/
│   └── Article.ts                # Article schema
├── public/                       # Static assets
├── vercel.json                   # Cron configuration
├── .env.local                    # Environment variables (not committed)
└── package.json
```

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

- [ ] Weather timing precision limited on Vercel Hobby plan (±59 minutes)
- [ ] News API free tier limited to 100 requests/day
- [ ] Stock data may have slight delays (free tier limitation)

See [open issues](https://github.com/Esstar612/newspaper/issues) for a full list of known issues.

---

## 🔮 Roadmap

- [ ] User authentication and personalization
- [ ] Bookmarking and reading lists
- [ ] Email notifications for breaking news
- [ ] Mobile app (React Native)
- [ ] Dark/light theme toggle
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
- [NewsAPI](https://newsapi.org/)
- [New York Times Developer Network](https://developer.nytimes.com/)
- [OpenWeatherMap](https://openweathermap.org/)
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