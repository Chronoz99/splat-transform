# Test App

This test application verifies that the packaged version of `@playcanvas/splat-transform` works correctly in a browser environment.

## Setup

The test-app uses the local package build via `file:../` dependency.

```bash
# First, build the parent package
cd ..
npm run build

# Then install test-app dependencies
cd test-app
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Features

- Tests the browser API from the packaged version
- Checks WebGPU availability
- Converts splat files between formats
- Tests file upload and download
- Validates TypeScript types

## Usage

1. Start the dev server: `npm run dev`
2. Open http://localhost:3001 in your browser
3. Select a splat file (.ply, .splat, .ksplat, .sog, .spz)
4. Choose an output format
5. Click "Convert File"
6. Download the result

## What It Tests

- ✅ Package loading from `file:../` dependency (local build)
- ✅ TypeScript definitions
- ✅ WebGPU detection
- ✅ File conversion API
- ✅ Browser compatibility
- ✅ GPU acceleration (when available)

## Installation in Production

For production use in your own projects:

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```

Then use the same imports:

```typescript
import { convert, isGpuAvailable } from '@playcanvas/splat-transform/browser';
```

## Troubleshooting

If the package fails to load:

1. Make sure you've built the parent package first: `cd .. && npm run build`
2. Run `npm install` in the test-app directory to link the local package
3. Clear your browser cache
4. Check the browser console for errors

For production deployments, always use the GitHub installation:

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```
