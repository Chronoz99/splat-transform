# Browser Support Implementation Plan

This document outlines the plan to create a browser-compatible version of splat-transform that can run entirely client-side.

## Overview

**Goal**: Create a browser-compatible library that exposes the core splat transformation functionality via a programmatic API, accepting `ArrayBuffer`/`File` inputs and returning `Blob`/`ArrayBuffer` outputs.

**Approach**: Dual-build strategy - maintain the existing Node.js CLI while adding a browser-compatible library export.

---

## Phase 1: Abstraction Layer for I/O

### 1.1 Create Abstract Data Source Interface

Create a new abstraction that works with both Node.js `FileHandle` and browser `ArrayBuffer`/`File`:

```typescript
// src/io/data-source.ts
interface DataSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  readAll(): Promise<Uint8Array>;
  close(): Promise<void>;
}

// Implementations:
// - NodeFileSource: wraps FileHandle
// - BufferSource: wraps ArrayBuffer/Uint8Array
// - BlobSource: wraps File/Blob (browser)
```

### 1.2 Create Abstract Data Sink Interface

```typescript
// src/io/data-sink.ts
interface DataSink {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<ArrayBuffer | void>;
}

// Implementations:
// - NodeFileSink: wraps FileHandle for writing
// - BufferSink: accumulates to ArrayBuffer (browser)
```

### Files to Modify:
- [ ] Create `src/io/data-source.ts`
- [ ] Create `src/io/data-sink.ts`
- [ ] Create `src/io/node-source.ts`
- [ ] Create `src/io/node-sink.ts`
- [ ] Create `src/io/browser-source.ts`
- [ ] Create `src/io/browser-sink.ts`

---

## Phase 2: Refactor Readers

Modify all readers to accept `DataSource` instead of `FileHandle`:

| Reader | Current Signature | New Signature |
|--------|-------------------|---------------|
| `read-ply.ts` | `readPly(file: FileHandle)` | `readPly(source: DataSource)` |
| `read-splat.ts` | `readSplat(file: FileHandle)` | `readSplat(source: DataSource)` |
| `read-ksplat.ts` | `readKsplat(file: FileHandle)` | `readKsplat(source: DataSource)` |
| `read-spz.ts` | `readSpz(file: FileHandle)` | `readSpz(source: DataSource)` |
| `read-sog.ts` | `readSog(file: FileHandle)` | `readSog(source: DataSource)` |
| `read-lcc.ts` | `readLcc(file: FileHandle, ...)` | `readLcc(source: DataSource, ...)` |

### Special Cases:
- **`read-sog.ts`**: Currently reads additional `.webp` files from disk. For unbundled SOG, browser version will need to accept a `Map<string, ArrayBuffer>` of companion files.
- **`read-lcc.ts`**: Similar multi-file handling needed.
- **`read-mjs.ts`**: Generator scripts - may not be supported in browser initially (security concerns with `eval`).

### Files to Modify:
- [ ] `src/readers/read-ply.ts`
- [ ] `src/readers/read-splat.ts`
- [ ] `src/readers/read-ksplat.ts`
- [ ] `src/readers/read-spz.ts`
- [ ] `src/readers/read-sog.ts`
- [ ] `src/readers/read-lcc.ts`
- [ ] `src/readers/decompress-ply.ts`
- [ ] `src/serialize/zip-reader.ts`

---

## Phase 3: Refactor Writers

Modify all writers to accept `DataSink` instead of `FileHandle`:

| Writer | Current Signature | New Signature |
|--------|-------------------|---------------|
| `write-ply.ts` | `writePly(file: FileHandle, ...)` | `writePly(sink: DataSink, ...)` |
| `write-compressed-ply.ts` | `writeCompressedPly(file: FileHandle, ...)` | `writeCompressedPly(sink: DataSink, ...)` |
| `write-csv.ts` | `writeCsv(file: FileHandle, ...)` | `writeCsv(sink: DataSink, ...)` |
| `write-sog.ts` | `writeSog(...)` | `writeSog(sink: DataSink, ...)` |
| `write-html.ts` | `writeHtml(...)` | May need special handling |

### Special Cases:
- **`write-sog.ts`**: Unbundled mode writes multiple files. Browser version could return a `Map<string, ArrayBuffer>` or a zip file.
- **`write-html.ts`**: Reads template files from disk. These need to be bundled or fetched.
- **`write-lod.ts`**: Multi-file output - similar to SOG unbundled.

### Files to Modify:
- [ ] `src/writers/write-ply.ts`
- [ ] `src/writers/write-compressed-ply.ts`
- [ ] `src/writers/write-csv.ts`
- [ ] `src/writers/write-sog.ts`
- [ ] `src/writers/write-html.ts`
- [ ] `src/writers/write-lod.ts`
- [ ] `src/serialize/writer.ts`
- [ ] `src/serialize/zip-writer.ts`

---

## Phase 4: Browser-Compatible GPU Support

### 4.1 Abstract GPU Device Creation

```typescript
// src/gpu/gpu-factory.ts
interface GpuFactory {
  isAvailable(): Promise<boolean>;
  createDevice(): Promise<GpuDevice | null>;
}

// Implementations:
// - NodeGpuFactory: uses 'webgpu' npm package (current behavior)
// - BrowserGpuFactory: uses navigator.gpu (native WebGPU)
```

### 4.2 Conditional Imports

Use dynamic imports or build-time conditions to avoid importing Node.js `webgpu` package in browser builds.

### Files to Modify:
- [ ] `src/gpu/gpu-device.ts` - Extract Node-specific code
- [ ] Create `src/gpu/gpu-factory.ts`
- [ ] Create `src/gpu/browser-gpu.ts`
- [ ] Create `src/gpu/node-gpu.ts`

---

## Phase 5: Create Browser API

### 5.1 Main Browser Entry Point

```typescript
// src/browser.ts
export interface TransformOptions {
  transforms?: Transform[];
  filters?: Filter[];
  harmonicBands?: number;
}

export interface ConvertOptions extends TransformOptions {
  inputFormat?: InputFormat;  // auto-detect if not specified
  outputFormat: OutputFormat;
  useGpu?: boolean;  // default: true if available
  sogIterations?: number;
}

// Single file conversion
export async function convert(
  input: ArrayBuffer | File | Blob,
  options: ConvertOptions
): Promise<ArrayBuffer>;

// Multiple file merge + conversion
export async function merge(
  inputs: Array<{ data: ArrayBuffer | File | Blob; transforms?: Transform[] }>,
  options: ConvertOptions
): Promise<ArrayBuffer>;

// Read splat data into DataTable for inspection/manipulation
export async function read(
  input: ArrayBuffer | File | Blob,
  format?: InputFormat
): Promise<DataTable>;

// Write DataTable to output format
export async function write(
  data: DataTable,
  format: OutputFormat,
  options?: WriteOptions
): Promise<ArrayBuffer>;

// Check WebGPU availability
export function isGpuAvailable(): Promise<boolean>;

// Export types and utilities
export { DataTable, Column, Transform, Filter, InputFormat, OutputFormat };
```

### 5.2 Transform and Filter Types

```typescript
export type Transform =
  | { type: 'translate'; x: number; y: number; z: number }
  | { type: 'rotate'; x: number; y: number; z: number }
  | { type: 'scale'; factor: number };

export type Filter =
  | { type: 'nan' }
  | { type: 'box'; min: [number, number, number]; max: [number, number, number] }
  | { type: 'sphere'; center: [number, number, number]; radius: number }
  | { type: 'value'; column: string; comparator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq'; value: number };
```

### Files to Create:
- [ ] `src/browser.ts` - Browser entry point
- [ ] `src/browser-types.ts` - Browser-specific types

---

## Phase 6: Build Configuration

### 6.1 Dual Build Setup

Modify `rollup.config.mjs` to produce two builds:

```javascript
// Output 1: Node.js CLI (existing)
{
  input: 'src/index.ts',
  output: { file: 'dist/index.mjs', format: 'esm' },
  external: ['node:fs/promises', 'node:path', ...nodeBuiltins]
}

// Output 2: Browser library
{
  input: 'src/browser.ts',
  output: [
    { file: 'dist/browser.mjs', format: 'esm' },
    { file: 'dist/browser.umd.js', format: 'umd', name: 'SplatTransform' }
  ],
  plugins: [
    // Replace Node.js imports with browser equivalents
    alias({ ... }),
    // Bundle everything for browser
    nodeResolve({ browser: true }),
    // Optionally minify
    terser()
  ]
}
```

### 6.2 Package.json Exports

```json
{
  "exports": {
    ".": {
      "node": "./dist/index.mjs",
      "browser": "./dist/browser.mjs",
      "default": "./dist/index.mjs"
    },
    "./browser": "./dist/browser.mjs"
  },
  "browser": {
    "./dist/index.mjs": "./dist/browser.mjs"
  }
}
```

### Files to Modify:
- [ ] `rollup.config.mjs`
- [ ] `package.json`
- [ ] `tsconfig.json` (may need browser lib types)

---

## Phase 7: Handle Special Dependencies

### 7.1 Crypto
- **Node**: `import { randomBytes } from 'crypto'`
- **Browser**: `crypto.getRandomValues(new Uint8Array(n))`

### 7.2 Path Operations
- Create minimal path utilities for browser or use a library like `path-browserify`

### 7.3 WebP Codec
- The `lib/webp.mjs` WASM module should work in browser
- Verify WASM loading works in browser context

### 7.4 PlayCanvas
- Already browser-compatible, but verify tree-shaking works

### Files to Create/Modify:
- [ ] `src/utils/crypto-polyfill.ts`
- [ ] `src/utils/path-polyfill.ts`
- [ ] Verify `lib/webp.mjs` browser compatibility

---

## Phase 8: Testing

### 8.1 Unit Tests
- [ ] Test each reader with `BufferSource`
- [ ] Test each writer with `BufferSink`
- [ ] Test transformations
- [ ] Test filters

### 8.2 Integration Tests
- [ ] Full conversion pipeline tests
- [ ] Browser environment tests (Playwright/Puppeteer)

### 8.3 Example/Demo
- [ ] Create simple HTML demo page
- [ ] File picker → transform → download

---

## Phase 9: Documentation

- [ ] Update README with browser usage examples
- [ ] Add JSDoc comments to browser API
- [ ] Create `docs/browser-api.md`

---

## Implementation Order

Recommended order to minimize disruption:

1. **Phase 1**: I/O Abstraction (foundation)
2. **Phase 2**: Refactor Readers (can be done incrementally)
3. **Phase 3**: Refactor Writers (can be done incrementally)
4. **Phase 6**: Build Configuration (enables testing)
5. **Phase 5**: Browser API (ties it together)
6. **Phase 4**: Browser GPU (optional enhancement)
7. **Phase 7**: Special Dependencies (as needed)
8. **Phase 8**: Testing
9. **Phase 9**: Documentation

---

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: I/O Abstraction | 2-3 days | High |
| Phase 2: Refactor Readers | 2-3 days | High |
| Phase 3: Refactor Writers | 2-3 days | High |
| Phase 4: Browser GPU | 1-2 days | Medium |
| Phase 5: Browser API | 1-2 days | High |
| Phase 6: Build Config | 1 day | High |
| Phase 7: Dependencies | 1 day | Medium |
| Phase 8: Testing | 2-3 days | High |
| Phase 9: Documentation | 1 day | Medium |

**Total: ~2-3 weeks**

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing CLI | Maintain backward compatibility through abstraction |
| Large bundle size | Tree-shaking, lazy loading, optional features |
| WebGPU browser support | CPU fallback already exists |
| WASM loading in browsers | Test early, provide fallback |
| Memory limits for large files | Streaming/chunked processing (future enhancement) |

---

## Future Enhancements

- Streaming support for very large files
- Web Worker support for non-blocking processing
- Progress callbacks
- Cancel/abort support
- WASM-based compression for better performance

---

## Notes

- The core transformation logic (`DataTable`, `process.ts`, `transform.ts`, `ordering.ts`) is already browser-compatible
- The k-means clustering has CPU fallback, so WebGPU is optional
- Generator scripts (`.mjs` input) may not be supported in browser for security reasons
