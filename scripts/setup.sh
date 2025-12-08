#!/bin/bash
# Quick setup and test script for the package

set -e

echo "🚀 Splat Transform Package Setup"
echo "================================"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build the package
echo "🔨 Building package with Rollup..."
npm run build
echo "✅ Package built"
echo ""

# Run tests
echo "🧪 Running unit tests..."
npm test
echo "✅ Tests passed"
echo ""

# Check package quality
echo "📋 Running publint checks..."
npm run publint
echo "✅ Package quality checks passed"
echo ""

# Setup test app
echo "🎨 Setting up test-app..."
cd test-app
npm install
cd ..
echo "✅ Test app ready"
echo ""

echo "========================================="
echo "✨ Setup complete! Next steps:"
echo ""
echo "1. Test the package locally:"
echo "   cd test-app && npm run dev"
echo ""
echo "2. Run unit tests:"
echo "   npm test"
echo ""
echo "3. Run tests in watch mode:"
echo "   npm run test:watch"
echo ""
echo "4. Build with Vite (alternative):"
echo "   npm run build:vite"
echo ""
echo "5. Publish to npm (when ready):"
echo "   npm publish"
echo ""
echo "📚 See BROWSER_API.md for API documentation"
echo "========================================="
