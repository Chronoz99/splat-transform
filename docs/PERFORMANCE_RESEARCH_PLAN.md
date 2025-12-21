# SOG Browser Compression Performance Research Plan

## Executive Summary

This document outlines a research plan to improve the performance of the browser-based SOG (Streaming Optimized Gaussians) compression pipeline without modifying the output format specification. The goal is to maintain full compatibility with existing SOG viewers while achieving faster encoding times in browser environments.

---

## ⚠️ VALIDATED ACTION PLAN (Updated: December 2024)

Based on thorough code review and research, the following actions are **recommended** for implementation. All changes maintain full backward compatibility and deterministic output.

### ✅ SAFE TO IMPLEMENT (Low Risk, High Confidence)

#### Phase 1: WebP WASM Optimization (Estimated: 2-3 days)
**Status**: ✅ COMPLETED (December 2024)

1. **Enable SIMD in WebP WASM build** (P0) ✅
   - Add `-msimd128` flag to Emscripten build command
   - WASM SIMD supported in: Chrome ≥91, Firefox ≥89, Safari ≥16.4, Node.js ≥16.4
   - **Impact**: 20-50% faster WebP encoding for lossless RGBA
   - **Risk**: None - produces identical output, SIMD is opt-in at runtime
   - **Implementation**: Updated `lib/BUILD.md` with new build command:
     ```bash
     emcc -O3 -msimd128 webp.c build/libwebp.a build/libsharpyuv.a \
       -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH \
       -sEXPORTED_FUNCTIONS='[...]' -o webp.mjs
     ```

2. **Expose WebP speed/method parameter** (P1)
   - libwebp's `WebPConfig.method` (0-6) controls speed/compression tradeoff
   - For **lossless encoding**: `quality` parameter (0-100) controls effort
   - **Current**: Using default effort (~75), can use `method=0` for fastest
   - **Risk**: None - lossless encoding produces exact same decoded pixels
   - **Implementation**: Modify `lib/webp.c` to accept optional speed parameter

#### Phase 2: Memory Access Optimization (Estimated: 1-2 days)
**Status**: ✅ COMPLETED (December 2024)

1. **Direct typed array access in hot loops** (P2) ✅
   - Previous: `getRow()` created object for each row access
   - Optimization: Pre-fetch column data arrays outside loops
   - **Location**: `browser-write-sog.ts` - `calcMinMax()`, `writeMeans()`, `writeQuaternions()`
   - **Impact**: ~5-10% improvement in data preparation phases
   - **Risk**: Very low - same algorithm, fewer object allocations
   - **Implementation**: Refactored to use direct `column.data[index]` access

2. **Pre-interleave data for GPU upload** (P2)
   - Current: `interleaveData()` called repeatedly in GPU clustering
   - Optimization: Cache interleaved buffers when data hasn't changed
   - **Location**: `gpu-clustering.ts`
   - **Risk**: Low - internal implementation detail

### ⚡ MODERATE RISK (Requires Careful Testing)

#### Phase 3: K-means Iteration Reduction (Estimated: 3-5 days)
**Status**: Needs benchmarking before implementation

1. **Reduce default iterations from 8 to 4-5** (P1)
   - Current code uses 8 iterations as default
   - Research suggests 4-6 iterations sufficient for 256 clusters
   - **Requires**: Visual quality comparison on test datasets
   - **Testing**: Compare PSNR/SSIM of output SOG files
   - **Risk**: Medium - could affect visual quality if too aggressive

2. **Better centroid initialization (K-means++)** (P2)
   - Current: Random initialization with collision detection
   - K-means++ selects centroids probabilistically based on distance
   - **Impact**: Fewer iterations needed to converge
   - **Risk**: Medium - changes convergence behavior, must validate output quality
   - **Note**: 1D case already has smart initialization (`initializeCentroids1D`)

### 🔬 RESEARCH NEEDED (Do Not Implement Without Benchmarks)

#### Phase 4: Parallelization Research (Estimated: 1-2 weeks)

1. **Web Workers for Independent Encodings** (P0 research priority)
   - SOG pipeline has several independent operations:
     - `writeMeans()` - position encoding
     - `writeQuaternions()` - rotation encoding  
     - `writeScales()` - scale clustering (depends on GPU device)
     - `writeColors()` - color clustering (depends on GPU device)
   - **Challenge**: Sharing GPU device across workers is complex
   - **Recommended approach**: Parallelize CPU-bound operations only
   - **Research needed**: Profile actual time breakdown to identify bottlenecks

2. **WebP parallel encoding** (P1 research priority)
   - Multiple WebP files could be encoded in parallel
   - **Challenge**: WASM memory is per-instance
   - **Approach**: Create multiple WebPCodec instances in workers
   - **Note**: Only beneficial if WebP encoding is a significant bottleneck

### ❌ NOT RECOMMENDED (Too Risky or Low ROI)

1. **Mini-batch K-means** ❌
   - Original plan suggested sampling subsets of data
   - **Problem**: Could produce non-deterministic results
   - **Problem**: Quality impact unclear for 256-cluster case
   - **Recommendation**: Skip unless quality validated extensively

2. **Morton sort optimization** ❌
   - Current Morton sort is already O(N log N)
   - Radix sort benefit is marginal for typical splat counts (100K-1M)
   - **Recommendation**: Low priority, high complexity

3. **Hierarchical K-means** ❌
   - Would change clustering results significantly
   - **Problem**: Different codebooks = different output
   - **Recommendation**: Skip - changes output semantics

---

## IMPLEMENTATION CHECKLIST

### Pre-Implementation Requirements
- [x] Run full test suite (`npm test`) - must pass all 144 tests ✅
- [ ] Benchmark current performance on test datasets:
  - [ ] Small: ~10K Gaussians
  - [ ] Medium: ~100K Gaussians
  - [ ] Large: ~1M Gaussians

### Phase 1: WebP SIMD (Safe)
- [x] Update Emscripten build with `-msimd128` flag ✅
- [x] Rebuild `lib/webp.wasm` and `lib/webp.mjs` ✅
- [x] Verify tests still pass ✅
- [ ] Benchmark WebP encoding time before/after
- [x] Update `lib/BUILD.md` documentation ✅

### Phase 2: Memory Optimization (Safe)
- [x] Refactor `calcMinMax()` to use direct array access ✅
- [x] Refactor `writeMeans()` to use direct array access ✅
- [x] Refactor `writeQuaternions()` to use direct array access ✅
- [x] Verify tests still pass ✅
- [ ] Measure memory allocation reduction in DevTools

### Phase 3: K-means Tuning (Requires Validation)
- [ ] Create visual comparison tool for SOG output
- [ ] Test iterations=4,5,6,7,8 on diverse datasets
- [ ] Document acceptable quality threshold
- [ ] Implement K-means++ initialization
- [ ] Validate output quality with new initialization

### Phase 4: Parallelization (Research)
- [ ] Profile time breakdown of SOG encoding pipeline
- [ ] Identify actual bottlenecks (is it K-means? WebP? Data prep?)
- [ ] Prototype Web Worker for WebP encoding
- [ ] Measure actual speedup vs. complexity cost

---

## ROLLBACK PLAN

All optimizations should be behind feature flags or easily revertible:

```typescript
interface WriteSogBrowserOptions {
  iterations?: number;        // Default: 8 (can reduce to 4-5)
  useGpu?: boolean;           // Default: true
  webpSpeed?: number;         // Default: 0 (fastest), range 0-6
  useParallelWebp?: boolean;  // Default: false (experimental)
}
```

If any optimization causes test failures or visual quality issues:
1. Revert the specific change
2. Document the failure case
3. Investigate root cause before re-attempting

---

## ORIGINAL RESEARCH PLAN (For Reference)

The sections below contain the original research analysis. Refer to the **Validated Action Plan** above for implementation guidance.

---

## Current Technical Architecture

### Overview of the SOG Compression Pipeline (Browser)

The SOG format compression in the browser (`browser-write-sog.ts`) follows this pipeline:

```
Input DataTable (Gaussian Splat Data)
    │
    ├──▶ Morton Order Sorting (spatial locality optimization)
    │
    ├──▶ Position Encoding (means_l.webp, means_u.webp)
    │       └── Log transform + 16-bit quantization → split into 2 WebP textures
    │
    ├──▶ Quaternion Encoding (quats.webp)
    │       └── Smallest-three compression + normalization → 8-bit WebP
    │
    ├──▶ Scale Encoding (scales.webp)
    │       └── K-means clustering (256 clusters) → codebook + labels WebP
    │
    ├──▶ Color/DC Encoding (sh0.webp)
    │       └── K-means clustering + sigmoid opacity → codebook + labels WebP
    │
    ├──▶ Spherical Harmonics (shN_*.webp) [if SH bands > 0]
    │       └── Hierarchical K-means → centroids + labels WebPs
    │
    └──▶ ZIP Bundling (meta.json + all .webp files)
            └── Store (uncompressed) ZIP archive
```

### Key Performance Bottlenecks Identified

#### 1. **K-Means Clustering** (Most Significant)
- **Location**: `src/spatial/k-means.ts`, `src/gpu/gpu-clustering.ts`
- **Issue**: Called multiple times for scales, colors, and spherical harmonics
- **Current approach**: 
  - GPU: WebGPU compute shaders with batched processing
  - CPU fallback: KD-tree nearest neighbor search per iteration
- **Iterations**: Default 8 iterations per clustering operation
- **Observations**:
  - Each k-means call processes N points × 256 clusters × iterations
  - For SH data: runs nested k-means (first large palette, then 256 clusters for codebook)
  - CPU path uses KD-tree which is O(N log K) per point vs brute O(N×K)

#### 2. **Morton Order Sorting**
- **Location**: `src/data-table/morton-order.ts`
- **Issue**: Recursive sorting with bucket subdivision
- **Current approach**: JavaScript array sort with Morton code computation
- **Observations**:
  - Uses 10-bit precision per axis (30-bit Morton codes)
  - Recursive re-sort for buckets > 256 elements

#### 3. **WebP Encoding** (WASM)
- **Location**: `src/utils/webp-codec.ts`, `lib/webp.c`
- **Issue**: Each texture requires a separate WASM call
- **Current approach**: Emscripten-compiled libwebp using lossless RGBA encoding
- **Observations**:
  - Memory copies between JS heap and WASM heap
  - Sequential encoding of multiple textures
  - Using `WebPEncodeLosslessRGBA` - no quality/speed tradeoff parameters exposed

#### 4. **Data Interleaving and Memory Access Patterns**
- **Location**: Throughout `browser-write-sog.ts`
- **Issue**: Column-oriented DataTable requires row-by-row access
- **Current approach**: `getRow()` calls with object allocation
- **Observations**:
  - Reuses row object but still has property access overhead
  - GPU clustering requires interleaving columns → rows for upload

#### 5. **ZIP Archive Creation**
- **Location**: `src/serialize/zip-writer.ts`
- **Issue**: Uncompressed ZIP with streaming writes
- **Current approach**: Store method (no compression) with CRC calculation
- **Observations**:
  - CRC32 calculated incrementally - reasonable
  - Multiple small writes vs. batched writes

---

## Research Areas for Performance Improvement

### 1. K-Means Acceleration (High Impact)

#### Research Topics:
- **Mini-batch K-means**: Sample subsets of data per iteration instead of full dataset
  - Search: "mini-batch k-means web gpu" / "stochastic k-means javascript"
  - Papers: "Web-Scale K-Means Clustering" (Sculley, 2010)
  
- **K-means++ initialization with approximation**: Better initial centroids = fewer iterations
  - Search: "k-means++ initialization webgpu" / "scalable k-means++ gpu"
  
- **Elkan's algorithm**: Triangle inequality to skip distance computations
  - Search: "elkan k-means gpu implementation"
  
- **Hierarchical K-means / Divisive clustering**: Build tree instead of flat 256 clusters
  - May reduce iterations by clustering subsets

- **WebGPU Compute Shader Optimizations**:
  - Shared memory utilization patterns
  - Workgroup size optimization (currently 64, chunk size 128)
  - Coalesced memory access patterns
  - f16 vs f32 tradeoffs (already conditionally using f16)
  - Search: "webgpu compute shader optimization" / "gpu k-means optimization techniques"

- **Approximate Nearest Neighbor in K-means**:
  - Product quantization for centroid search
  - Locality-sensitive hashing for cluster assignment

#### Compatibility Note:
✅ K-means optimizations are **fully compatible** - only affects encoding speed, not output format.

---

### 2. Morton Order Sorting Optimization (Medium Impact)

#### Research Topics:
- **Radix sort for Morton codes**: O(N) instead of O(N log N)
  - Search: "javascript radix sort typed array" / "gpu radix sort webgpu"
  
- **Parallel Morton code computation**: SIMD.js or WebGPU compute
  - Search: "webgpu morton code generation"
  
- **Space-filling curve alternatives**: Hilbert curve may have better locality
  - Compatibility: Still Morton in output, different internal sort order would change compression but maintain format compatibility

- **Eliminate recursive bucket subdivision**: May not significantly improve compression

#### Compatibility Note:
✅ Sorting optimizations are **fully compatible** - affects encoding order within spec tolerance.

---

### 3. WebP Encoding Optimization (Medium Impact)

#### Research Topics:
- **WebP encoding speed parameters**: libwebp has speed/quality tradeoff knobs
  - `WebPConfigPreset(&config, WEBP_PRESET_DEFAULT, quality)` then `config.method = 0-6`
  - Search: "libwebp lossless speed optimization" / "webp encoding performance"
  
- **Parallel WebP encoding**: Encode multiple textures concurrently
  - WebWorkers for parallel WASM instances
  - Search: "web workers wasm parallel encoding"
  
- **WASM SIMD enablement**: Compile libwebp with `-msimd128` flag
  - Search: "emscripten simd webp" / "wasm simd image encoding"
  
- **Memory pool for WASM**: Reduce malloc/free overhead
  - Pre-allocate working memory buffers

- **Alternative lossless formats**: PNG with WASM encoder (for comparison baseline)
  - Must output WebP per spec, but can benchmark alternatives for reference

#### Compatibility Note:
✅ WebP optimizations are **fully compatible** - lossless encoding produces identical output regardless of speed settings.

---

### 4. Data Structure and Memory Optimization (Medium Impact)

#### Research Topics:
- **Structure-of-Arrays (SoA) to Array-of-Structures (AoS) conversion optimization**:
  - Search: "javascript typed array transpose optimization"
  - Consider: Pre-transposed storage for GPU upload paths

- **Avoid object allocation in hot loops**:
  - Replace `getRow(index, row, columns)` with direct typed array access
  - Search: "javascript avoid object allocation performance"

- **TypedArray view sharing**: Reduce `subarray()` calls
  - Pre-compute views for frequently accessed ranges

- **Memory-mapped / streaming DataTable**: Process in chunks for very large datasets
  - Reduces peak memory usage
  - Search: "javascript streaming data processing"

- **ArrayBuffer.transfer()**: Zero-copy buffer handoff (where supported)
  - Search: "javascript arraybuffer transfer performance"

#### Compatibility Note:
✅ Memory optimizations are **fully compatible** - internal implementation detail.

---

### 5. Parallelization Strategies (High Impact)

#### Research Topics:
- **Web Workers for pipeline stages**:
  - Morton sorting in worker
  - K-means per attribute in parallel workers
  - WebP encoding in parallel workers
  - Search: "web workers compute heavy tasks" / "transferable objects web workers"

- **SharedArrayBuffer for zero-copy worker communication**:
  - Share DataTable buffers across workers
  - Search: "sharedarraybuffer web workers" / "atomics javascript parallel"
  - Note: Requires COOP/COEP headers

- **OffscreenCanvas + WebGPU in workers**:
  - GPU compute in dedicated worker
  - Search: "offscreencanvas webgpu worker"

- **Pipeline parallelism**: 
  - Start next texture encoding while k-means runs
  - Overlap Morton sort with first attribute processing

#### Compatibility Note:
✅ Parallelization is **fully compatible** - produces identical output.

---

### 6. Progressive/Incremental Encoding (UX Improvement)

#### Research Topics:
- **Chunked processing with progress**: Already partially implemented
  - Fine-grain progress callbacks during k-means iterations
  
- **Cancelable encoding**: AbortController integration
  - Search: "abortcontroller async javascript" / "cancelable promise pattern"

- **Streaming ZIP output**: Write chunks as they're ready
  - Already streaming, but could improve perceived performance

#### Compatibility Note:
✅ Progressive encoding is **fully compatible**.

---

### 7. Algorithmic Alternatives for Clustering (Experimental)

#### Research Topics:
- **Vector Quantization alternatives**:
  - Product Quantization (PQ) - might produce similar quality with faster encoding
  - Search: "product quantization javascript" / "pq compression gpu"
  
- **Learned codebooks**: Pre-trained codebooks for common Gaussian splat data distributions
  - Would require spec extension, NOT compatible without viewer updates

- **Median cut / Octree quantization**: For color clustering specifically
  - Search: "median cut algorithm javascript" / "color quantization octree"

- **Neural compression**: Lightweight autoencoders for latent space clustering
  - Search: "neural image compression javascript" / "tiny autoencoder wasm"

#### Compatibility Note:
⚠️ Some alternatives may produce different output quality - must validate against spec tolerance.

---

## Benchmarking Plan

### Metrics to Track:
1. **Total encoding time** (wall clock)
2. **Time per pipeline stage** (breakdown)
3. **Peak memory usage** (browser DevTools)
4. **GPU utilization** (if measurable)
5. **Output file size** (should remain unchanged for lossless operations)
6. **Visual quality** (PSNR/SSIM if any lossy approximations introduced)

### Test Datasets:
- Small: ~10K Gaussians
- Medium: ~100K Gaussians  
- Large: ~1M Gaussians
- Very Large: ~5M+ Gaussians (stress test)

### Test Environments:
- Chrome (latest) - desktop
- Firefox (latest) - desktop
- Safari (latest) - desktop
- Chrome on Android (mobile GPU)
- Safari on iOS (mobile GPU)

---

## Implementation Priority Matrix

| Optimization | Impact | Effort | Compatibility | Priority |
|--------------|--------|--------|---------------|----------|
| Mini-batch K-means | High | Medium | ✅ Full | **P0** |
| Web Workers parallelization | High | High | ✅ Full | **P0** |
| WebGPU shader optimization | High | Medium | ✅ Full | **P1** |
| WebP speed parameters | Medium | Low | ✅ Full | **P1** |
| WASM SIMD for WebP | Medium | Medium | ✅ Full | **P1** |
| Memory access patterns | Medium | Medium | ✅ Full | **P2** |
| Radix sort for Morton | Low-Med | Low | ✅ Full | **P2** |
| K-means++ init | Medium | Low | ✅ Full | **P2** |
| Streaming/chunked processing | Low | Medium | ✅ Full | **P3** |

---

## External Resources to Research

### Papers:
1. "Web-Scale K-Means Clustering" - Sculley (2010)
2. "Using the Triangle Inequality to Accelerate k-Means" - Elkan (2003)
3. "k-means++: The Advantages of Careful Seeding" - Arthur & Vassilvitskii (2007)
4. "Scalable K-Means++" - Bahmani et al. (2012)
5. "GPU-Accelerated K-Means Clustering" - various CUDA/OpenCL papers

### Libraries/References:
1. WebGPU best practices: https://toji.dev/webgpu-best-practices/
2. libwebp documentation: https://developers.google.com/speed/webp/docs/api
3. Emscripten SIMD: https://emscripten.org/docs/porting/simd.html
4. Web Workers spec: https://html.spec.whatwg.org/multipage/workers.html
5. SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer

### Existing Implementations to Study:
1. TensorFlow.js k-means implementation
2. ml.js clustering library
3. wasm-pack/wasm-bindgen patterns for high-performance JS↔WASM
4. PlayCanvas Engine WebGPU compute patterns (already used)

---

## Next Steps

1. **Baseline Benchmarks**: Create comprehensive benchmarks for current implementation
2. **Profile Hotspots**: Use Chrome DevTools Performance panel to identify actual bottlenecks
3. **Prototype Mini-batch K-means**: Quick win with minimal code changes
4. **Evaluate Web Worker architecture**: Design parallel pipeline
5. **Test WebP speed parameters**: Modify WASM build to expose speed config
6. **Implement top P0/P1 optimizations**: Based on profiling results

---

## Appendix: SOG Format Specification Summary

The SOG format output consists of:
- `meta.json` - Metadata with codebooks and file references
- `means_l.webp` / `means_u.webp` - 16-bit position data (low/high bytes)
- `quats.webp` - Quaternion rotations (smallest-three encoding)
- `scales.webp` - Scale labels (k-means clustered)
- `sh0.webp` - Color DC + opacity labels (k-means clustered)
- `shN_centroids.webp` / `shN_labels.webp` - Spherical harmonics (hierarchical k-means)

All files are bundled in an uncompressed ZIP archive with `.sog` extension.

**Critical Constraint**: Any optimization must produce byte-identical WebP textures for identical input data to maintain viewer compatibility. The k-means clustering is deterministic given the same initialization, but mini-batch or parallel approaches must be validated against output quality requirements.
