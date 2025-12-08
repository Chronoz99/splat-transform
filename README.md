# SplatTransform - 3D Gaussian Splat Converter

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/splat-transform.svg)](https://www.npmjs.com/package/@playcanvas/splat-transform)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/splat-transform)](https://npmtrends.com/@playcanvas/splat-transform)
[![License](https://img.shields.io/npm/l/@playcanvas/splat-transform.svg)](https://github.com/playcanvas/splat-transform/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/splat-transform/) | [Blog](https://blog.playcanvas.com/) | [Forum](https://forum.playcanvas.com/) |

SplatTransform is an open source CLI tool for converting and editing Gaussian splats. It can:

📥 Read PLY, Compressed PLY, SOG, SPLAT, KSPLAT, SPZ and LCC formats  
📤 Write PLY, Compressed PLY, SOG, CSV, HTML Viewer and LOD (streaming) formats  
🔗 Merge multiple splats  
🔄 Apply transformations to input splats  
🎛️ Filter out Gaussians or spherical harmonic bands  
⚙️ Procedurally generate splats using JavaScript generators  
🌐 **Works in browsers** with WebGPU acceleration (or CPU fallback)

## Installation

Install or update to the latest version:

```bash
npm install -g @playcanvas/splat-transform
```

## Usage

```bash
splat-transform [GLOBAL] input [ACTIONS]  ...  output [ACTIONS]
```

**Key points:**
- Input files become the working set; ACTIONS are applied in order
- The last file is the output; actions after it modify the final result

## Supported Formats

| Format | Input | Output | Description |
| ------ | ----- | ------ | ----------- |
| `.ply` | ✅ | ✅ | Standard PLY format |
| `.sog` | ✅ | ✅ | Bundled super-compressed format (recommended) |
| `meta.json` | ✅ | ✅ | Unbundled super-compressed format (accompanied by `.webp` textures) |
| `.compressed.ply` | ✅ | ✅ | Compressed PLY format (auto-detected and decompressed on read) |
| `.lcc` | ✅ | ❌ | LCC file format (XGRIDS) |
| `.ksplat` | ✅ | ❌ | Compressed splat format (mkkellogg format) |
| `.splat` | ✅ | ❌ | Compressed splat format (antimatter15 format) |
| `.spz` | ✅ | ❌ | Compressed splat format (Niantic format) |
| `.mjs` | ✅ | ❌ | Generate a scene using an mjs script (Beta) |
| `.csv` | ❌ | ✅ | Comma-separated values spreadsheet |
| `.html` | ❌ | ✅ | HTML viewer app (single-page or unbundled) based on SOG |

## Actions

Actions can be repeated and applied in any order:

```none
-t, --translate        <x,y,z>          Translate splats by (x, y, z)
-r, --rotate           <x,y,z>          Rotate splats by Euler angles (x, y, z) in degrees
-s, --scale            <factor>         Uniformly scale splats by factor
-H, --filter-harmonics <0|1|2|3>        Remove spherical harmonic bands > n
-N, --filter-nan                        Remove Gaussians with NaN or Inf values
-B, --filter-box       <x,y,z,X,Y,Z>    Remove Gaussians outside box (min, max corners)
-S, --filter-sphere    <x,y,z,radius>   Remove Gaussians outside sphere (center, radius)
-V, --filter-value     <name,cmp,value> Keep splats where <name> <cmp> <value>
                                          cmp ∈ {lt,lte,gt,gte,eq,neq}
-p, --params           <key=val,...>    Pass parameters to .mjs generator script
-l, --lod              <n>              Specify the level of detail of this model, n >= 0.
```

## Global Options

```none
-h, --help                              Show this help and exit
-v, --version                           Show version and exit
-q, --quiet                             Suppress non-error output
-w, --overwrite                         Overwrite output file if it exists
-i, --iterations       <n>              Iterations for SOG SH compression (more=better). Default: 10
-L, --list-gpus                         List all available GPU adapters and exit
-g, --gpu              <n|cpu>          Select device for SOG compression: GPU adapter index | 'cpu'
-E, --viewer-settings  <settings.json>  HTML viewer settings JSON file
-U, --unbundled                         Generate unbundled HTML viewer with separate files
-O, --lod-select       <n,n,...>        Comma-separated LOD levels to read from LCC input
-C, --lod-chunk-count  <n>              Approx number of Gaussians per LOD chunk in K. Default: 512
-X, --lod-chunk-extent <n>              Approx size of an LOD chunk in world units (m). Default: 16
```

> [!NOTE]
> See the [SuperSplat Viewer Settings Schema](https://github.com/playcanvas/supersplat-viewer?tab=readme-ov-file#settings-schema) for details on how to pass data to the `-E` option.

## Examples

### Basic Operations

```bash
# Simple format conversion
splat-transform input.ply output.csv

# Convert from .splat format
splat-transform input.splat output.ply

# Convert from .ksplat format
splat-transform input.ksplat output.ply

# Convert to compressed PLY
splat-transform input.ply output.compressed.ply

# Uncompress a compressed PLY back to standard PLY
# (compressed .ply is detected automatically on read)
splat-transform input.compressed.ply output.ply

# Convert to SOG bundled format
splat-transform input.ply output.sog

# Convert to SOG unbundled format
splat-transform input.ply output/meta.json

# Convert from SOG (bundled) back to PLY
splat-transform scene.sog restored.ply

# Convert from SOG (unbundled folder) back to PLY
splat-transform output/meta.json restored.ply

# Convert to standalone HTML viewer (bundled, single file)
splat-transform input.ply output.html

# Convert to unbundled HTML viewer (separate CSS, JS, and SOG files)
splat-transform -U input.ply output.html

# Convert to HTML viewer with custom settings
splat-transform -E settings.json input.ply output.html
```

### Transformations

```bash
# Scale and translate
splat-transform bunny.ply -s 0.5 -t 0,0,10 bunny_scaled.ply

# Rotate by 90 degrees around Y axis
splat-transform input.ply -r 0,90,0 output.ply

# Chain multiple transformations
splat-transform input.ply -s 2 -t 1,0,0 -r 0,0,45 output.ply
```

### Filtering

```bash
# Remove entries containing NaN and Inf
splat-transform input.ply --filter-nan output.ply

# Filter by opacity values (keep only splats with opacity > 0.5)
splat-transform input.ply -V opacity,gt,0.5 output.ply

# Strip spherical harmonic bands higher than 2
splat-transform input.ply --filter-harmonics 2 output.ply
```

### Advanced Usage

```bash
# Combine multiple files with different transforms
splat-transform -w cloudA.ply -r 0,90,0 cloudB.ply -s 2 merged.compressed.ply

# Apply final transformations to combined result
splat-transform input1.ply input2.ply output.ply -t 0,0,10 -s 0.5
```

### Generators (Beta)

Generator scripts can be used to synthesize gaussian splat data. See [gen-grid.mjs](generators/gen-grid.mjs) for an example.

```bash
splat-transform gen-grid.mjs -p width=10,height=10,scale=10,color=0.1 scenes/grid.ply -w
```

### Device Selection for SOG Compression

When compressing to SOG format, you can control which device (GPU or CPU) performs the compression:

```bash
# List available GPU adapters
splat-transform --list-gpus

# Let WebGPU automatically choose the best GPU (default behavior)
splat-transform input.ply output.sog

# Explicitly select a GPU adapter by index
splat-transform -g 0 input.ply output.sog  # Use first listed adapter
splat-transform -g 1 input.ply output.sog  # Use second listed adapter

# Use CPU for compression instead (much slower but always available)
splat-transform -g cpu input.ply output.sog
```

> [!NOTE]
> When `-g` is not specified, WebGPU automatically selects the best available GPU. Use `-L` to list available adapters with their indices and names. The order and availability of adapters depends on your system and GPU drivers. Use `-g <index>` to select a specific adapter, or `-g cpu` to force CPU computation.

> [!WARNING]
> CPU compression can be significantly slower than GPU compression (often 5-10x slower). Use CPU mode only if GPU drivers are unavailable or problematic.

## Browser API

> [!NOTE]
> Browser support with enhanced build tooling is available in [this fork](https://github.com/Chronoz99/splat-transform/tree/feature/package-build).

SplatTransform can run entirely in the browser, enabling client-side splat conversion without a server. Features include:

✨ **WebGPU acceleration** for fast SOG compression (2-4x faster)  
🔄 **CPU fallback** when GPU is unavailable  
📦 **Zero server dependencies** - all processing happens in the browser  
🎯 **Full TypeScript support** with comprehensive type definitions  
🧪 **Battle-tested** with Vite and other modern bundlers

### Installation

Install directly from the GitHub fork:

```bash
# Install from GitHub branch
npm install github:Chronoz99/splat-transform#feature/package-build
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "@playcanvas/splat-transform": "github:Chronoz99/splat-transform#feature/package-build"
  }
}
```

This works for local development and production deployments (Vercel, Cloudflare, Netlify, etc.).

### Browser Requirements

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Basic API | 90+ | 88+ | 14+ | 90+ |
| WebGPU | 113+ | 121+* | 17+ | 113+ |

*Firefox requires `dom.webgpu.enabled` flag in about:config

### Basic Usage

```typescript
import { 
  read, 
  write, 
  convert, 
  merge,
  isGpuAvailable,
  setQuiet 
} from '@playcanvas/splat-transform/browser';

// Read a splat file
const dataTable = await read(file); // File, Blob, or ArrayBuffer
console.log(`Loaded ${dataTable.numRows} splats`);

// Convert to another format
const result = await convert(file, {
  outputFormat: 'sog',
  useGpu: await isGpuAvailable()
});

// Download the result
const blob = new Blob([result], { type: 'application/octet-stream' });
```

### API Reference

#### `read(input, options?)`

Read a splat file into a DataTable.

```typescript
const dataTable = await read(file, { format: 'ply' });

// Options:
// - format?: 'ply' | 'splat' | 'ksplat' | 'sog' | 'spz' (auto-detected from filename)
```

#### `write(dataTable, format, options?)`

Write a DataTable to a specific format.

```typescript
const buffer = await write(dataTable, 'sog', { 
  useGpu: true,
  sogIterations: 8 
});

// Options:
// - useGpu?: boolean (default: true if available)
// - sogIterations?: number (default: 8, for SOG format)
```

#### `convert(input, options)`

Convert a splat file with optional transforms and filters.

```typescript
const result = await convert(file, {
  outputFormat: 'ply',
  useGpu: true,
  transforms: [
    { type: 'scale', factor: 2.0 },
    { type: 'translate', x: 0, y: 10, z: 0 },
    { type: 'rotate', x: 0, y: 90, z: 0 }
  ],
  filters: [
    { type: 'nan' },
    { type: 'box', min: [-10, -10, -10], max: [10, 10, 10] },
    { type: 'sphere', center: [0, 0, 0], radius: 5 },
    { type: 'value', column: 'opacity', comparator: 'gt', value: 0.5 },
    { type: 'bands', bands: 2 }
  ]
});
```

#### `merge(inputs, options)`

Merge multiple splat files with per-file transforms.

```typescript
const result = await merge([
  { data: file1 },
  { data: file2, transforms: [{ type: 'translate', x: 10, y: 0, z: 0 }] }
], {
  outputFormat: 'sog',
  useGpu: true
});
```

#### `isGpuAvailable()`

Check if WebGPU is available in the browser.

```typescript
const gpuAvailable = await isGpuAvailable();
// true in Chrome 113+, Edge 113+, Safari 18+
// false in Firefox (behind flag), older browsers
```

#### `getGpuAdapters()`

Get list of available GPU adapters.

```typescript
const adapters = await getGpuAdapters();
// ['Apple M1 Pro', 'NVIDIA GeForce RTX 3080', ...]
```

#### `setQuiet(quiet)`

Enable or disable console logging.

```typescript
setQuiet(true);  // Suppress logs
setQuiet(false); // Enable logs (default)
```

### Supported Formats (Browser)

| Format | Read | Write | Notes |
| ------ | ---- | ----- | ----- |
| `.ply` | ✅ | ✅ | Standard and compressed PLY |
| `.sog` | ✅ | ✅ | Recommended for web |
| `.splat` | ✅ | ❌ | |
| `.ksplat` | ✅ | ❌ | |
| `.spz` | ✅ | ❌ | |
| `.csv` | ❌ | ✅ | |

> [!NOTE]
> LCC format and `.mjs` generators are not supported in browsers.

### WebGPU vs CPU

The browser API uses WebGPU for GPU-accelerated k-means clustering when encoding to SOG format. If WebGPU is unavailable, it automatically falls back to CPU.

| Browser | WebGPU Support |
| ------- | -------------- |
| Chrome 113+ | ✅ |
| Edge 113+ | ✅ |
| Safari 18+ | ✅ |
| Firefox | 🔄 Behind flag |
| Older browsers | ❌ (CPU fallback) |

You can force CPU mode for testing:

```typescript
const result = await convert(file, {
  outputFormat: 'sog',
  useGpu: false  // Force CPU
});
```

### Example: React Component

```tsx
import { useState, useEffect } from 'react';
import { convert, isGpuAvailable } from '@playcanvas/splat-transform/browser';

function SplatConverter() {
  const [gpuAvailable, setGpuAvailable] = useState(false);
  
  useEffect(() => {
    isGpuAvailable().then(setGpuAvailable);
  }, []);

  async function handleFile(file: File) {
    const result = await convert(file, {
      outputFormat: 'sog',
      useGpu: gpuAvailable,
      transforms: [{ type: 'scale', factor: 0.5 }]
    });
    
    // Create download link
    const blob = new Blob([result]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted.sog';
    a.click();
  }

  return (
    <div>
      <p>GPU: {gpuAvailable ? '✅' : '❌ (using CPU)'}</p>
      <input type="file" onChange={e => handleFile(e.target.files[0])} />
    </div>
  );
}
```

### TypeScript Types

Full TypeScript support is included:

```typescript
import type {
  ConvertOptions,
  WriteOptions,
  ReadOptions,
  MergeOptions,
  MergeInput,
  Transform,
  Filter,
  InputFormat,
  OutputFormat,
  DataTable,
  Column
} from '@playcanvas/splat-transform/browser';
```

## Getting Help

```bash
# Show version
splat-transform --version

# Show help
splat-transform --help
```
