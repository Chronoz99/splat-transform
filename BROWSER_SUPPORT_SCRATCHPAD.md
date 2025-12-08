# Browser Support - Active Scratchpad

> **Purpose**: This is the active working document for the LLM agent implementing browser support.
> - Reference `BROWSER_SUPPORT_PLAN.md` for detailed design decisions
> - Update this file at the END of each task with progress and learnings
> - Keep entries minimal and actionable

---

## Current Phase: 9 - Documentation

### Status: NOT STARTED

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| 1. I/O Abstraction | ✅ Complete | Created `src/io/` with DataSource and DataSink |
| 2. Refactor Readers | ✅ Complete | All readers now use DataSource |
| 3. Refactor Writers | ✅ Complete | All writers now use DataSink |
| 4. Browser GPU | ✅ Complete | Created gpu-factory.ts, node-gpu.ts, browser-gpu.ts |
| 5. Browser API | ✅ Complete | Created src/browser.ts with clean API |
| 6. Build Config | ✅ Complete | Dual build with alias plugin, browser-specific files |
| 7. Dependencies | ✅ Complete | Fixed webp.mjs and webp-codec.ts for browser |
| 8. Testing | ✅ Complete | 16 unit tests, demo.html, fixed ZipReader and SOG writer bugs |
| 9. Documentation | ⬜ Not Started | |

Status legend: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ⏸️ Blocked

---

## Phase 1: I/O Abstraction

### Files to Create
- [x] `src/io/data-source.ts` - Interface + base implementations
- [x] `src/io/data-sink.ts` - Interface + base implementations
- [x] `src/io/index.ts` - Module exports

### Key Interfaces

```typescript
// DataSource - for reading
interface DataSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  readAll(): Promise<Uint8Array>;
  close(): Promise<void>;
}

// DataSink - for writing  
interface DataSink {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<ArrayBuffer | void>;
}
```

### Implementation Notes
- Node implementations: wrap `FileHandle`
- Browser implementations: wrap `ArrayBuffer`/`Blob`/`File`
- Keep in same files for now, can split later if needed

### Learnings
- Created unified DataSource interface with NodeFileSource, BufferSource, BlobSource implementations
- Created unified DataSink interface with NodeFileSink, BufferSink, BlobSink implementations
- Added createDataSource() and createDataSink() factory functions for convenience
- Build compiles cleanly

---

## Phase 2: Refactor Readers

### Files to Modify
- [x] `src/readers/read-ply.ts`
- [x] `src/readers/read-splat.ts`
- [x] `src/readers/read-ksplat.ts`
- [x] `src/readers/read-spz.ts`
- [x] `src/readers/read-sog.ts`
- [x] `src/readers/read-lcc.ts`
- [x] `src/readers/decompress-ply.ts` (no changes needed - works with PlyData)
- [x] `src/serialize/zip-reader.ts`
- [x] `src/index.ts` (updated to use NodeFileSource)

### Pattern
```typescript
// Before
async function readXxx(file: FileHandle): Promise<DataTable>

// After  
async function readXxx(source: DataSource): Promise<DataTable>
```

### Special Cases
- `read-sog.ts`: Multi-file (webp textures) - needs companion files map
- `read-lcc.ts`: Multi-file - needs companion files map
- `read-mjs.ts`: Skip for browser (security)

### Learnings
- All readers now accept DataSource instead of FileHandle
- For multi-file formats (SOG, LCC), added `companionFiles` option for browser support
- Replaced Node.js Buffer methods with DataView for cross-platform compatibility
- decompress-ply.ts needed no changes as it operates on PlyData objects
- read-mjs.ts deliberately skipped (security concerns with eval in browser)

---

## Phase 3: Refactor Writers

### Files to Modify
- [x] `src/writers/write-ply.ts`
- [x] `src/writers/write-compressed-ply.ts`
- [x] `src/writers/write-csv.ts`
- [x] `src/writers/write-sog.ts`
- [x] `src/writers/write-html.ts`
- [x] `src/writers/write-lod.ts`
- [x] `src/serialize/writer.ts`
- [x] `src/serialize/zip-writer.ts` (no changes - uses Writer interface)
- [x] `src/index.ts` (updated to use NodeFileSink)

### Special Cases
- `write-sog.ts`: Added WriteSogOptions for browser with dataSinkFactory and bundled mode
- `write-html.ts`: Uses DataSink interface directly
- `write-lod.ts`: Added WriteLodOptions for browser with dataSinkFactory

### Learnings
- All writers now accept DataSink instead of FileHandle
- writer.ts updated with SinkWriter class to adapt DataSink to Writer interface
- For multi-file output (SOG, LOD), added dataSinkFactory option for browser
- zip-writer.ts already used Writer interface, no changes needed
- Build compiles cleanly

---

## Phase 4: Browser GPU

### Files
- [x] `src/gpu/gpu-factory.ts` - Abstract factory with platform detection
- [x] `src/gpu/gpu-device.ts` - Refactored to export only GpuDevice and Application classes
- [x] `src/gpu/node-gpu.ts` - Node.js GPU implementation using Dawn (webgpu npm package)
- [x] `src/gpu/browser-gpu.ts` - Browser GPU implementation using native navigator.gpu

### Key Point
- Browser uses native `navigator.gpu`
- Node uses `webgpu` npm package
- CPU fallback already exists in `k-means.ts`

### Learnings
- Created GpuFactory interface with isAvailable(), enumerateAdapters(), createDevice() methods
- gpu-factory.ts provides platform detection and dynamic imports for browser vs Node
- gpu-device.ts now only exports the platform-agnostic GpuDevice and Application classes
- node-gpu.ts contains all Node-specific code (Dawn globals, adapter enumeration via error parsing)
- browser-gpu.ts contains browser-specific code (OffscreenCanvas, navigator.gpu)
- Updated src/index.ts and src/writers/write-sog.ts to import from node-gpu.ts directly
- Build compiles cleanly without circular dependencies

---

## Phase 5: Browser API

### Files Created
- [x] `src/browser.ts` - Main browser entry point with clean API

### Exports
```typescript
// Functions
export { convert, merge, read, write, isGpuAvailable, getGpuAdapters, setQuiet }

// Classes
export { DataTable, Column }

// Types
export type { 
    InputFormat, OutputFormat, Transform, Filter,
    TranslateTransform, RotateTransform, ScaleTransform,
    NaNFilter, BoxFilter, SphereFilter, ValueFilter, BandsFilter,
    ReadOptions, WriteOptions, ConvertOptions, MergeInput, MergeOptions,
    TypedArray
}
```

### Key API Functions
- `read(input, options)` - Read splat data from ArrayBuffer/File/Blob
- `write(dataTable, format, options)` - Write DataTable to ArrayBuffer
- `convert(input, options)` - Convert between formats with transforms/filters
- `merge(inputs, options)` - Merge multiple splat files
- `isGpuAvailable()` - Check WebGPU availability
- `getGpuAdapters()` - List available GPU adapters

### Learnings
- Created clean browser-friendly API separate from CLI
- Used browser-friendly types (plain arrays instead of Vec3 for coordinates)
- Provided comprehensive TypeScript types for all options
- Added JSDoc examples for all public functions
- Used internal helpers to convert browser types to internal ProcessAction types
- Build compiles cleanly

---

## Phase 6: Build Config

### Files Modified
- [x] `rollup.config.mjs` - Added browser build configuration
- [x] `package.json` - Added exports field with browser subpath

### Additional Files Created
- [x] `src/io/browser-data-source.ts` - Browser-only DataSource implementations
- [x] `src/io/browser-data-sink.ts` - Browser-only DataSink implementations  
- [x] `src/readers/browser-read-sog.ts` - Browser-compatible SOG reader
- [x] `src/writers/browser-write-sog.ts` - Browser-compatible SOG writer

### Build Outputs
- `dist/index.mjs` - Node CLI (existing)
- `dist/browser.mjs` - Browser ESM entry point
- `dist/browser-browser.mjs` - Browser main chunk (code-split)
- `dist/browser-gpu-device.mjs` - GPU device chunk
- `dist/browser-browser-gpu.mjs` - Browser GPU factory
- `dist/browser-node-gpu.mjs` - Node GPU factory (external for browser)
- `dist/types/` - TypeScript declarations

### Learnings
- Used @rollup/plugin-alias to redirect Node-specific imports to browser implementations
- Created separate browser-specific files for I/O and SOG read/write
- LCC format not supported in browser (requires Node.js filesystem)
- Code splitting with dynamic imports keeps chunks separate
- External function for `node:*` modules to treat them as external
- Build produces ESM output with source maps and type declarations

---

## Phase 7: Dependencies

### Polyfills Needed
- [x] `crypto.randomBytes` - NOT NEEDED (only used in Node CLI `src/index.ts`)
- [x] Path utilities - NOT NEEDED (only used in Node CLI and Node-specific reader/writer files)

### Verify Browser Compat
- [x] `lib/webp.mjs` WASM loading - FIXED (patched to detect environment at runtime)
- [x] `playcanvas` tree-shaking - VERIFIED (rollup uses browser:true in resolve plugin)

### Files Modified
- [x] `lib/webp.mjs` - Changed hardcoded `ENVIRONMENT_IS_NODE=true` to runtime detection
- [x] `lib/BUILD.md` - Updated build instructions for browser+Node support
- [x] `src/utils/webp-codec.ts` - Changed `Buffer.from()` to `new Uint8Array()`

### Learnings
- `crypto.randomBytes` is only used in Node CLI for temp file generation, not needed in browser
- Path utilities (`dirname`, `join`, etc.) are only used in Node-specific files
- `lib/webp.mjs` was hardcoded with `ENVIRONMENT_IS_NODE=true` - patched to detect environment using `typeof process !== "undefined"`
- Added browser-side `readAsync` using `fetch` in the else branch of environment detection
- `webp-codec.ts` used `Buffer.from()` which is Node-specific - changed to `new Uint8Array()`
- Updated BUILD.md to document the environment flag removal and runtime detection patch
- Build compiles cleanly with expected warning about `module` being external (only used in Node)

---

## Phase 8 & 9: Testing & Docs

_(Expand when reached)_

---

## Do's and Don'ts

### Do's ✅
- Keep backward compatibility with Node CLI
- Use TypeScript interfaces for abstraction
- Test each phase before moving to next
- Commit after each meaningful change
- Update this scratchpad at end of each task

### Don'ts ❌
- Don't modify `src/index.ts` CLI logic unnecessarily
- Don't add browser polyfills to Node build
- Don't break existing tests
- Don't over-engineer - start simple
- Don't forget to handle errors consistently

---

## Phase 8: Testing

### Files Created
- [x] `test/browser-api.test.mjs` - Unit tests for browser API (16 tests)
- [x] `demo.html` - Interactive browser demo page

### Bug Fixes During Testing

#### ZipReader Bug (Critical)
- **Issue**: `ZipReader.list()` failed to parse zip files with data descriptor flag (0x08)
- **Cause**: Variable `size` was used as loop limit but was 0 when using data descriptors
- **Fix**: Changed `while (pos < size)` to `while (pos < fileSize)` in `src/serialize/zip-reader.ts`

#### SOG Writer Bug
- **Issue**: `writeSogBrowser` called `sink.close()` internally, then caller also called `close()`
- **Cause**: Double `close()` on `BufferSink` resulted in empty buffer
- **Fix**: Removed `sink.close()` from `writeSogBrowser` - caller is responsible for closing

### Test Results
- 16/16 tests passing
- Tests cover: read, write, convert, merge, GPU utilities, SOG round-trip
- Test time: ~43 seconds (includes SOG encoding with k-means)

### Commands
```bash
# Run all tests
npm test

# Run specific test file
node --test test/browser-api.test.mjs
```

### Learnings
- Node.js 18+ has built-in test runner (`node --test`)
- Browser File API can be partially simulated in Node using Blob
- SOG format requires k-means clustering which is slow without GPU
- ZipReader needs to handle data descriptor format (flag 0x08)

---

## Blockers / Questions

_(Add any blockers or questions that need resolution)_

---

## Quick Reference

### Key Files (read-only reference)
- `src/data-table.ts` - Core data structure (already portable)
- `src/process.ts` - Transform/filter pipeline (already portable)
- `src/utils/k-means.ts` - Has CPU fallback (line 167)

### Commands
```bash
# Build
npm run build

# Lint
npm run lint

# Test
npm test
```

---

_Last updated: Phase 8 Testing complete_
