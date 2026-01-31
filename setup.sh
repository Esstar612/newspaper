#!/bin/bash

echo "========================================"
echo "Newspaper Next.js Project Setup"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local file not found!"
    echo "Creating .env.local from template..."
    cp .env.local.example .env.local
    echo ""
    echo "📝 Please edit .env.local and add your API keys:"
    echo "   - MONGODB_URI"
    echo "   - NEWS_API_KEY"
    echo "   - NYT_API_KEY"
    echo "   - ADMIN_INGEST_TOKEN"
    echo "   - WEATHER_API_KEY (optional)"
    echo "   - MARKET_DATA_API_TOKEN (optional)"
    echo ""
else
    echo "✓ .env.local file exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your API keys"
echo "2. Start the development server: npm run dev"
echo "3. Visit http://localhost:3000"
echo ""
echo "To ingest news articles:"
echo "1. Go to http://localhost:3000/news"
echo "2. Click 'Ingest now (dev)' button"
echo "   OR"
echo "   Use curl:"
echo '   curl -X POST http://localhost:3000/api/admin/ingest-news \'
echo '     -H "Authorization: Bearer YOUR_TOKEN" \'
echo '     -H "Content-Type: application/json" \'
echo '     -d '"'"'{"limit": 50}'"'"
echo ""
