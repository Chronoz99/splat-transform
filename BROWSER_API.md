# Browser API Documentation

Complete API reference for `@playcanvas/splat-transform/browser`

## Table of Contents

- [Installation](#installation)
- [Vite Setup](#vite-setup)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Types](#types)
- [Examples](#examples)
- [WebGPU Support](#webgpu-support)
- [Error Handling](#error-handling)
- [Performance Tips](#performance-tips)

## Installation

Install directly from the GitHub fork (feature/package-build branch):

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```

## Vite Setup

If you're using Vite (recommended), add this configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // ... your other config
  optimizeDeps: {
    exclude: ['@playcanvas/splat-transform']
  }
});
```

**Why?** This prevents Vite from pre-bundling the package, ensuring proper WASM and WebGPU support.

### Other Bundlers

**Webpack**: No special configuration needed.

**esbuild**: Use `external: ['@playcanvas/splat-transform']` if building a library.

**Rollup**: Configure similar to your current project setup.

## Quick Start

First, install from GitHub:

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```

Then use in your code:

```typescript
import { convert, isGpuAvailable } from '@playcanvas/splat-transform/browser';

// Check GPU availability
const gpuAvailable = await isGpuAvailable();

// Convert a file
const plyFile = /* File object from input */;
const sogBuffer = await convert(plyFile, {
  outputFormat: 'sog',
  useGpu: gpuAvailable,
  sogIterations: 8
});

// Create a download
const blob = new Blob([sogBuffer], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'output.sog';
a.click();
```

### Full React Component Example

```typescript
import { useState, useEffect } from 'react';
import { convert, isGpuAvailable, type ProgressInfo } from '@playcanvas/splat-transform/browser';

export function SplatCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [result, setResult] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    isGpuAvailable().then(setGpuAvailable);
  }, []);

  const handleConvert = async () => {
    if (!file) return;

    try {
      setProgress(0);
      setStatusMessage('Starting...');
      
      const output = await convert(file, {
        outputFormat: 'sog',
        useGpu: gpuAvailable,
        sogIterations: 8,
        onProgress: (info: ProgressInfo) => {
          setProgress(Math.round(info.progress * 100));
          setStatusMessage(info.message);
        }
      });
      
      setProgress(100);
      setStatusMessage('Complete!');
      setResult(output);
      
      // Auto-download
      const blob = new Blob([output], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.\w+$/, '.sog');
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Conversion failed:', error);
      setStatusMessage('Error: ' + (error as Error).message);
    }
  };

  return (
    <div>
      <h2>SOG Compressor</h2>
      <p>GPU: {gpuAvailable ? '✅ Available' : '❌ Unavailable (CPU)'}</p>
      
      <input
        type="file"
        accept=".ply,.splat,.ksplat"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      
      <button onClick={handleConvert} disabled={!file || (progress > 0 && progress < 100)}>
        Convert to SOG
      </button>
      
      {progress > 0 && (
        <div>
          <progress value={progress} max={100} />
          <p>{progress}% - {statusMessage}</p>
        </div>
      )}
      
      {result && (
        <p>✅ Done: {(result.byteLength / 1024 / 1024).toFixed(2)} MB</p>
      )}
    </div>
  );
}
}
```

## API Reference

### `convert(input, options)`

Convert splat files between formats.

**Parameters:**
- `input`: `File | Blob | ArrayBuffer` - Input splat file
- `options`: `ConvertOptions` - Conversion options

**Returns:** `Promise<ArrayBuffer>` - Converted file data

**Example:**
```typescript
const result = await convert(file, {
  outputFormat: 'sog',
  useGpu: true,
  sogIterations: 8,
  transforms: [
    { type: 'translate', x: 0, y: 1, z: 0 },
    { type: 'scale', factor: 2.0 }
  ]
});
```

---

### `read(input, options?)`

Read splat file into a DataTable for inspection or manipulation.

**Parameters:**
- `input`: `File | Blob | ArrayBuffer` - Input splat file
- `options?`: `ReadOptions` - Optional read options

**Returns:** `Promise<DataTable>` - Parsed data table

**Example:**
```typescript
const dataTable = await read(file, { format: 'ply' });
console.log('Number of splats:', dataTable.numRows);
console.log('Columns:', dataTable.columns.map(c => c.name));
```

---

### `write(dataTable, format, options?)`

Write a DataTable to a specific format.

**Parameters:**
- `dataTable`: `DataTable` - Data to write
- `format`: `OutputFormat` - Output format ('ply', 'sog', 'compressed-ply', 'csv')
- `options?`: `WriteOptions` - Optional write options

**Returns:** `Promise<ArrayBuffer>` - Encoded file data

**Example:**
```typescript
const sogData = await write(dataTable, 'sog', {
  useGpu: true,
  sogIterations: 10
});
```

---

### `merge(inputs, options)`

Merge multiple splat files into one.

**Parameters:**
- `inputs`: `MergeInput[]` - Array of inputs to merge
- `options`: `MergeOptions` - Merge options

**Returns:** `Promise<ArrayBuffer>` - Merged file data

**Example:**
```typescript
const merged = await merge(
  [
    { data: file1, transforms: [{ type: 'translate', x: -5, y: 0, z: 0 }] },
    { data: file2, transforms: [{ type: 'translate', x: 5, y: 0, z: 0 }] }
  ],
  { outputFormat: 'sog' }
);
```

---

### `isGpuAvailable()`

Check if WebGPU is available in the current browser.

**Returns:** `Promise<boolean>` - True if WebGPU is available

**Example:**
```typescript
const hasGpu = await isGpuAvailable();
if (hasGpu) {
  console.log('GPU acceleration available');
}
```

---

### `getGpuAdapters()`

Get information about available GPU adapters.

**Returns:** `Promise<GpuAdapter[]>` - Array of GPU adapter info

**Example:**
```typescript
const adapters = await getGpuAdapters();
adapters.forEach(adapter => {
  console.log(`${adapter.name} (${adapter.vendor})`);
});
```

---

### `setQuiet(quiet)`

Control console logging output.

**Parameters:**
- `quiet`: `boolean` - If true, suppress console output

**Example:**
```typescript
setQuiet(true); // Disable logging
```

---

## Types

### `ConvertOptions`

```typescript
interface ConvertOptions {
  outputFormat: OutputFormat;           // Required: 'ply' | 'sog' | 'compressed-ply' | 'csv'
  inputFormat?: InputFormat;            // Optional: auto-detect if not specified
  useGpu?: boolean;                     // Use GPU for SOG clustering (default: false)
  sogIterations?: number;               // K-means iterations for SOG (default: 8)
  transforms?: Transform[];             // Transforms to apply
  filters?: Filter[];                   // Filters to apply
  companionFiles?: Map<string, ArrayBuffer>; // For multi-file formats
  bundled?: boolean;                    // Bundle all data (SOG, default: true)
  onProgress?: ProgressCallback;        // Callback for progress updates
}
```

### `ProgressCallback` and `ProgressInfo`

Track conversion progress with a callback:

```typescript
type ProgressCallback = (info: ProgressInfo) => void;

interface ProgressInfo {
  stage: ProgressStage;    // Current stage of processing
  progress: number;        // Overall progress from 0 to 1
  message: string;         // Human-readable message
}

type ProgressStage =
  | 'reading'
  | 'processing'
  | 'writing'
  | 'writing:means'
  | 'writing:quaternions'
  | 'writing:scales'
  | 'writing:colors'
  | 'writing:spherical-harmonics'
  | 'writing:finalize'
  | 'complete';
```

**Example:**
```typescript
const result = await convert(file, {
  outputFormat: 'sog',
  useGpu: true,
  onProgress: (info) => {
    console.log(`[${info.stage}] ${Math.round(info.progress * 100)}% - ${info.message}`);
    // Update your UI progress bar
    progressBar.style.width = `${info.progress * 100}%`;
    statusText.textContent = info.message;
  }
});
```

### `Transform`

Apply spatial transformations:

```typescript
// Translate
{ type: 'translate', x: number, y: number, z: number }

// Rotate (Euler angles in degrees)
{ type: 'rotate', x: number, y: number, z: number }

// Scale uniformly
{ type: 'scale', factor: number }
```

### `Filter`

Filter splats based on criteria:

```typescript
// Remove NaN/Infinity values
{ type: 'nan' }

// Bounding box filter
{ type: 'box', min: [x, y, z], max: [x, y, z] }

// Sphere filter
{ type: 'sphere', center: [x, y, z], radius: number }

// Value comparison
{ type: 'value', column: string, comparator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq', value: number }

// Filter SH bands (0-3)
{ type: 'bands', value: 0 | 1 | 2 | 3 }
```

### `DataTable`

```typescript
class DataTable {
  numRows: number;
  columns: Column[];
  
  getColumn(name: string): Column | undefined;
}
```

### `Column`

```typescript
class Column {
  name: string;
  data: TypedArray;
  dataType: string;
}
```

---

## Examples

### Convert PLY to SOG with GPU

```typescript
import { convert, isGpuAvailable } from '@playcanvas/splat-transform/browser';

async function convertToSog(plyFile: File) {
  const useGpu = await isGpuAvailable();
  
  const sogBuffer = await convert(plyFile, {
    outputFormat: 'sog',
    useGpu,
    sogIterations: 8
  });
  
  return new Blob([sogBuffer], { type: 'application/octet-stream' });
}
```

### Transform and Filter

```typescript
const result = await convert(file, {
  outputFormat: 'ply',
  transforms: [
    { type: 'translate', x: 0, y: 2, z: 0 },   // Move up by 2 units
    { type: 'rotate', x: 0, y: 90, z: 0 },     // Rotate 90° around Y
    { type: 'scale', factor: 0.5 }             // Scale to half size
  ],
  filters: [
    { type: 'nan' },                           // Remove invalid values
    { type: 'box',                             // Keep only splats in box
      min: [-10, -10, -10],
      max: [10, 10, 10]
    }
  ]
});
```

### Read and Inspect Data

```typescript
const dataTable = await read(file);

console.log(`Total splats: ${dataTable.numRows}`);
console.log('Available columns:');
dataTable.columns.forEach(col => {
  console.log(`  ${col.name}: ${col.dataType}`);
});

// Access specific column
const xColumn = dataTable.getColumn('x');
if (xColumn) {
  console.log('X values:', xColumn.data);
}
```

### Merge Multiple Files

```typescript
import { merge } from '@playcanvas/splat-transform/browser';

const merged = await merge(
  [
    {
      data: file1,
      transforms: [
        { type: 'translate', x: -5, y: 0, z: 0 }
      ]
    },
    {
      data: file2,
      transforms: [
        { type: 'translate', x: 5, y: 0, z: 0 }
      ]
    }
  ],
  {
    outputFormat: 'sog',
    useGpu: true
  }
);
```

### With Progress Tracking

```typescript
// Note: Native progress callbacks not yet implemented
// Use a manual progress indicator:

function showProgress(message: string) {
  console.log(message);
  // Update UI...
}

try {
  showProgress('Starting conversion...');
  const result = await convert(file, options);
  showProgress('Conversion complete!');
} catch (error) {
  showProgress('Conversion failed');
  console.error(error);
}
```

---

## WebGPU Support

### Browser Requirements

WebGPU is required for GPU-accelerated SOG compression:

- **Chrome/Edge**: 113+ (stable)
- **Firefox**: 121+ (enable `dom.webgpu.enabled` in about:config)
- **Safari**: 17+ (macOS Sonoma or later)

### Checking Support

```typescript
const gpuAvailable = await isGpuAvailable();

if (gpuAvailable) {
  // Use GPU acceleration
  await convert(file, { outputFormat: 'sog', useGpu: true });
} else {
  // Fall back to CPU
  await convert(file, { outputFormat: 'sog', useGpu: false });
}
```

### GPU Adapter Information

```typescript
const adapters = await getGpuAdapters();

adapters.forEach((adapter, i) => {
  console.log(`GPU ${i + 1}:`);
  console.log(`  Name: ${adapter.name}`);
  console.log(`  Vendor: ${adapter.vendor}`);
  console.log(`  Features: ${adapter.features.join(', ')}`);
});
```

---

## Error Handling

### Common Errors

```typescript
try {
  const result = await convert(file, options);
} catch (error) {
  if (error instanceof Error) {
    // Handle specific errors
    if (error.message.includes('Unsupported format')) {
      console.error('File format not supported');
    } else if (error.message.includes('GPU')) {
      console.error('GPU error, falling back to CPU');
      // Retry without GPU
      const result = await convert(file, { ...options, useGpu: false });
    } else {
      console.error('Conversion failed:', error.message);
    }
  }
}
```

### Validation

```typescript
function validateFile(file: File): boolean {
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    throw new Error(`File too large: ${file.size} bytes (max: ${maxSize})`);
  }
  
  const validExtensions = ['.ply', '.splat', '.ksplat', '.sog', '.spz'];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!validExtensions.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  return true;
}
```

---

## Performance Tips

### 1. Use GPU When Available

GPU acceleration is 2-4x faster for SOG compression:

```typescript
const useGpu = await isGpuAvailable();
await convert(file, { outputFormat: 'sog', useGpu });
```

### 2. Choose Appropriate Iteration Count

More iterations = better quality but slower:

```typescript
// Fast (lower quality)
await convert(file, { outputFormat: 'sog', sogIterations: 4 });

// Balanced (recommended)
await convert(file, { outputFormat: 'sog', sogIterations: 8 });

// High quality (slower)
await convert(file, { outputFormat: 'sog', sogIterations: 16 });
```

### 3. Filter Before Processing

Apply filters to reduce data size before expensive operations:

```typescript
await convert(file, {
  outputFormat: 'sog',
  filters: [
    { type: 'nan' },  // Remove invalid data first
    { type: 'box', min: [-10, -10, -10], max: [10, 10, 10] }
  ]
});
```

### 4. Bundle for Single Files

For browser use, bundled format is simpler:

```typescript
await convert(file, {
  outputFormat: 'sog',
  bundled: true  // All data in one file (default for browser)
});
```

### 5. Consider File Size Limits

Browser memory is limited. For files > 100MB:

```typescript
const maxSize = 100 * 1024 * 1024; // 100MB

if (file.size > maxSize) {
  console.warn('Large file - consider server-side processing');
  // Fall back to server or show warning
}
```

---

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type {
  ConvertOptions,
  Transform,
  Filter,
  DataTable,
  Column,
  OutputFormat,
  InputFormat
} from '@playcanvas/splat-transform/browser';
```

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Basic API | 90+ | 88+ | 14+ | 90+ |
| WebGPU | 113+ | 121+* | 17+ | 113+ |
| File API | ✓ | ✓ | ✓ | ✓ |
| TypedArrays | ✓ | ✓ | ✓ | ✓ |

*Firefox requires `dom.webgpu.enabled` flag

---

## License

MIT - See LICENSE file for details

---

## Support

- GitHub Fork: https://github.com/Chronoz99/splat-transform/tree/feature/package-build
- Issues: https://github.com/Chronoz99/splat-transform/issues
- Documentation: See BROWSER_API.md in the repository
- Examples: See `test-app/` directory in the repository

## Installation

```bash
npm install github:Chronoz99/splat-transform#feature/package-build
```
