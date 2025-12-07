# Browser Support - Active Scratchpad

> **Purpose**: This is the active working document for the LLM agent implementing browser support.
> - Reference `BROWSER_SUPPORT_PLAN.md` for detailed design decisions
> - Update this file at the END of each task with progress and learnings
> - Keep entries minimal and actionable

---

## Current Phase: 1 - I/O Abstraction

### Status: NOT STARTED

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| 1. I/O Abstraction | ⬜ Not Started | |
| 2. Refactor Readers | ⬜ Not Started | |
| 3. Refactor Writers | ⬜ Not Started | |
| 4. Browser GPU | ⬜ Not Started | |
| 5. Browser API | ⬜ Not Started | |
| 6. Build Config | ⬜ Not Started | |
| 7. Dependencies | ⬜ Not Started | |
| 8. Testing | ⬜ Not Started | |
| 9. Documentation | ⬜ Not Started | |

Status legend: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ⏸️ Blocked

---

## Phase 1: I/O Abstraction

### Files to Create
- [ ] `src/io/data-source.ts` - Interface + base implementations
- [ ] `src/io/data-sink.ts` - Interface + base implementations

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
_(Update after completing phase)_

---

## Phase 2: Refactor Readers

### Files to Modify
- [ ] `src/readers/read-ply.ts`
- [ ] `src/readers/read-splat.ts`
- [ ] `src/readers/read-ksplat.ts`
- [ ] `src/readers/read-spz.ts`
- [ ] `src/readers/read-sog.ts`
- [ ] `src/readers/read-lcc.ts`
- [ ] `src/readers/decompress-ply.ts`
- [ ] `src/serialize/zip-reader.ts`

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
_(Update after completing phase)_

---

## Phase 3: Refactor Writers

### Files to Modify
- [ ] `src/writers/write-ply.ts`
- [ ] `src/writers/write-compressed-ply.ts`
- [ ] `src/writers/write-csv.ts`
- [ ] `src/writers/write-sog.ts`
- [ ] `src/writers/write-html.ts`
- [ ] `src/writers/write-lod.ts`
- [ ] `src/serialize/writer.ts`
- [ ] `src/serialize/zip-writer.ts`

### Special Cases
- `write-sog.ts`: Unbundled returns `Map<string, ArrayBuffer>`
- `write-html.ts`: Template files need bundling
- `write-lod.ts`: Multi-file output

### Learnings
_(Update after completing phase)_

---

## Phase 4: Browser GPU

### Files
- [ ] `src/gpu/gpu-factory.ts` - Abstract factory
- [ ] Modify `src/gpu/gpu-device.ts` - Extract Node-specific

### Key Point
- Browser uses native `navigator.gpu`
- Node uses `webgpu` npm package
- CPU fallback already exists in `k-means.ts`

### Learnings
_(Update after completing phase)_

---

## Phase 5: Browser API

### Files to Create
- [ ] `src/browser.ts` - Main entry point

### Exports
```typescript
export { convert, merge, read, write, isGpuAvailable }
export { DataTable, Column }
export type { Transform, Filter, InputFormat, OutputFormat }
```

### Learnings
_(Update after completing phase)_

---

## Phase 6: Build Config

### Files to Modify
- [ ] `rollup.config.mjs` - Add browser build
- [ ] `package.json` - Add exports field

### Build Outputs
- `dist/index.mjs` - Node CLI (existing)
- `dist/browser.mjs` - Browser ESM
- `dist/browser.umd.js` - Browser UMD (optional)

### Learnings
_(Update after completing phase)_

---

## Phase 7: Dependencies

### Polyfills Needed
- [ ] `crypto.randomBytes` → `crypto.getRandomValues`
- [ ] Path utilities (minimal)

### Verify Browser Compat
- [ ] `lib/webp.mjs` WASM loading
- [ ] `playcanvas` tree-shaking

### Learnings
_(Update after completing phase)_

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

# Test (when added)
npm test
```

---

_Last updated: Not started_
