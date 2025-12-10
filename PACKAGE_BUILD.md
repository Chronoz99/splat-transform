# Browser Package Build

This branch (`feature/package-build`) adds enhanced build tooling and testing infrastructure for browser usage of splat-transform.

## Quick Start

### Installation

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```

Or in your `package.json`:

```json
{
  "dependencies": {
    "@playcanvas/splat-transform": "github:Chronoz99/splat-transform#feature/package-build"
  }
}
```

### Usage

```typescript
import { convert, isGpuAvailable } from '@playcanvas/splat-transform/browser';

// Check GPU availability
const gpuAvailable = await isGpuAvailable();

// Convert a file
const result = await convert(file, {
  outputFormat: 'sog',
  useGpu: gpuAvailable
});

// Download result
const blob = new Blob([result], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
```

## Features

- ✅ **WebGPU acceleration** - 2-4x faster SOG compression with GPU
- ✅ **CPU fallback** - Works everywhere, even without GPU
- ✅ **Full TypeScript support** - Complete type definitions included
- ✅ **Modern bundlers** - Works with Vite, Webpack, esbuild, etc.
- ✅ **Zero server dependencies** - All processing in browser

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Basic API | 90+ | 88+ | 14+ | 90+ |
| WebGPU | 113+ | 121+* | 17+ | 113+ |

*Firefox requires `dom.webgpu.enabled` flag

## Documentation

- **[BROWSER_API.md](./BROWSER_API.md)** - Complete API reference with examples
- **[test-app/](./test-app/)** - Live test application
- **[README.md](./README.md)** - Full CLI and API documentation

## Local Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Test in browser
cd test-app
npm install
npm run dev
# Visit http://localhost:3001
```

## Testing

Run the test app to verify everything works:

```bash
# Build the package first
npm run build

# Run test app
cd test-app
npm install
npm run dev
```

Open http://localhost:3001 and test file conversions.

## Vite Configuration

If using Vite, add to your `vite.config.ts`:

```typescript
export default defineConfig({
  optimizeDeps: {
    exclude: ['@playcanvas/splat-transform']
  }
});
```

## What's New in This Branch

- Vite and Vitest configuration
- Comprehensive unit tests (13 passing)
- Browser test application with beautiful UI
- Enhanced documentation
- Helper scripts for setup and testing

## Repository

**Fork**: https://github.com/Chronoz99/splat-transform/tree/feature/package-build  
**Original**: https://github.com/playcanvas/splat-transform

## License

MIT - See [LICENSE](./LICENSE) file for details
