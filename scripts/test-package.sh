#!/bin/bash
# Test package workflow script

set -e

echo "🧪 Testing Package Workflow"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build
echo -e "${BLUE}Step 1: Building package...${NC}"
npm run build
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 2: Run tests
echo -e "${BLUE}Step 2: Running tests...${NC}"
npm test
echo -e "${GREEN}✅ Tests passed${NC}"
echo ""

# Step 3: Check package quality
echo -e "${BLUE}Step 3: Checking package quality...${NC}"
npm run publint
echo -e "${GREEN}✅ Package quality checks passed${NC}"
echo ""

# Step 4: Pack and inspect
echo -e "${BLUE}Step 4: Packing package...${NC}"
npm pack --dry-run
echo -e "${GREEN}✅ Package contents verified${NC}"
echo ""

# Step 5: Test in test-app
echo -e "${BLUE}Step 5: Testing in test-app...${NC}"
cd test-app

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing test-app dependencies...${NC}"
    npm install
fi

echo -e "${YELLOW}Building test-app...${NC}"
npm run build
echo -e "${GREEN}✅ Test app builds successfully${NC}"

cd ..
echo ""

# Summary
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✨ All tests passed!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Package is ready for:"
echo "  • Local testing: cd test-app && npm run dev"
echo "  • Publishing: npm publish"
echo ""
