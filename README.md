# Newspaper - News, Stocks & Weather Dashboard

A modern Next.js application that aggregates news from multiple sources, displays real-time stock market data, and provides weather forecasts with interactive D3.js visualizations.

## Features

### 📰 News
- Multi-source news aggregation (NYT, NewsAPI)
- Search and filter articles by keyword and source
- Cursor-based pagination for efficient browsing
- Admin API for ingesting new articles

### 📈 Stocks
- Real-time stock price quotes
- Multi-currency conversion support
- Track major stocks (AAPL, MSFT, GOOGL, etc.)

### 🌤️ Weather
- 5-day weather forecasts
- Interactive D3.js visualizations:
  - Temperature bar chart
  - Humidity line graph
  - Weather conditions pie chart

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Data Visualization**: D3.js
- **Styling**: Tailwind CSS
- **APIs**: 
  - NewsAPI
  - New York Times API
  - OpenWeatherMap API
  - Market Data API
  - Frankfurter (Currency Exchange)

## Project Structure

```
newspaper-nextjs/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   └── ingest-news/route.ts    # Admin endpoint for news ingestion
│   │   ├── health/route.ts             # Health check endpoint
│   │   ├── news/route.ts               # News API with search & pagination
│   │   ├── stocks/[symbol]/route.ts    # Stock price API
│   │   └── weather/route.ts            # Weather forecast API
│   ├── news/page.tsx                   # News feed page
│   ├── stocks/page.tsx                 # Stock tracker page
│   ├── weather/page.tsx                # Weather visualization page
│   ├── layout.tsx                      # Root layout
│   ├── page.tsx                        # Home page
│   └── globals.css                     # Global styles
├── components/
│   ├── ArticleCard.tsx                 # News article card component
│   ├── TemperatureBarGraph.tsx         # D3 temperature visualization
│   ├── HumidityLineGraph.tsx           # D3 humidity visualization
│   └── WeatherPieChart.tsx             # D3 weather conditions chart
├── lib/
│   └── db.ts                           # MongoDB connection utility
├── models/
│   └── Article.ts                      # Mongoose Article model
└── public/                             # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB database
- API keys for:
  - NewsAPI
  - New York Times
  - OpenWeatherMap
  - Market Data API (optional)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd newspaper-nextjs
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```env
# MongoDB
MONGODB_URI=your_mongodb_connection_string

# News APIs
NEWS_API_KEY=your_newsapi_key
NYT_API_KEY=your_nyt_api_key

# Admin
ADMIN_INGEST_TOKEN=your_secure_random_token

# Optional
MARKET_DATA_API_TOKEN=your_market_data_token
WEATHER_API_KEY=your_openweathermap_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### News Ingestion

To populate your database with news articles, make a POST request to the admin endpoint:

```bash
curl -X POST http://localhost:3000/api/admin/ingest-news \
  -H "Authorization: Bearer YOUR_ADMIN_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "section": "business"}'
```

Or use the "Ingest now" button on the news page (development mode only).

### API Endpoints

#### Health Check
```
GET /api/health
```
Returns database connection status and article count.

#### News Feed
```
GET /api/news?limit=20&q=tesla&source=NYT&cursor=...
```
- `limit`: Number of articles (max 50)
- `q`: Search query
- `source`: Filter by source
- `cursor`: Pagination cursor

#### Stock Price
```
GET /api/stocks/AAPL?currency=EUR
```

#### Weather Forecast
```
GET /api/weather?location=New%20York
```

## Database Schema

### Article Model
```typescript
{
  title: String (required)
  description: String
  url: String (required, unique)
  imageUrl: String
  source: String (required)
  publishedAt: Date
  tags: [String]
  providerId: String
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

Indexes:
- `url`: Unique index for deduplication
- `publishedAt`: Descending for feed sorting
- `source, publishedAt`: Compound index for filtered feeds

## Development

### Build for Production
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `NEWS_API_KEY` | NewsAPI.org API key | Yes |
| `NYT_API_KEY` | New York Times API key | Yes |
| `ADMIN_INGEST_TOKEN` | Secret token for admin endpoints | Yes |
| `MARKET_DATA_API_TOKEN` | Market Data API token | No |
| `WEATHER_API_KEY` | OpenWeatherMap API key | No |

## Migration from Old React App

This Next.js app is a modernized version of the original React application with:

- Server-side rendering and API routes
- TypeScript for type safety
- Improved component architecture
- Better state management
- Optimized data fetching
- Professional MongoDB schema with proper indexing

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- News data provided by NewsAPI and The New York Times
- Stock data from Market Data API
- Weather data from OpenWeatherMap
- Currency conversion by Frankfurter API
