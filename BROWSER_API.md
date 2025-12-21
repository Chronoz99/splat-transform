# Browser API Documentation

Complete API reference for `@playcanvas/splat-transform/browser`

## Table of Contents

- [Installation](#installation)
- [Vite Setup](#vite-setup)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Types](#types)
- [Examples](#examples)
- [Encryption API](#encryption-api)
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

## Supported Formats

| Input | Output | Notes |
|-------|--------|-------|
| `.ply` | `.ply` | Standard PLY format |
| `.compressed.ply` | `.compressed.ply` | Compressed PLY with clustering |
| `.sog` | `.sog` | PlayCanvas optimized format |
| `.ksplat` | `.csv` | For data inspection |
| `.splat` | | |
| `.spz` | | |

Convert between any supported input and output format:

```typescript
// Any input format → Any output format
const result = await convert(inputFile, { outputFormat: 'sog' });
const result = await convert(inputFile, { outputFormat: 'ply' });
const result = await convert(inputFile, { outputFormat: 'compressed-ply' });
const result = await convert(inputFile, { outputFormat: 'csv' });
```

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

// Bounding box filter - keep splats within a box
{ type: 'box', min: [-10, -10, -10], max: [10, 10, 10] }

// Sphere filter - keep splats within radius of a point
{ type: 'sphere', center: [0, 0, 0], radius: 5.0 }

// Value comparison - filter by column values
// Example: keep only splats with opacity > 0.5
{ type: 'value', column: 'opacity', comparator: 'gt', value: 0.5 }

// Spherical harmonics bands (0-3)
// 0 = DC only (smallest file, flat colors)
// 1 = 1st order (4 coeffs, basic shading)
// 2 = 2nd order (9 coeffs, good quality)
// 3 = 3rd order (16 coeffs, full quality)
{ type: 'bands', value: 1 }  // Remove bands > 1 to reduce file size
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

## Encryption API

The encryption API provides AES-256-GCM encryption for protecting splat assets. While not unbreakable DRM (data must eventually be decrypted for rendering), it significantly raises the barrier for casual asset theft.

> **⚠️ Important**: This is obfuscation, not true DRM. A determined attacker with browser dev tools can still extract decrypted data from memory. Use this as one layer in a defense-in-depth strategy.

### Quick Encryption Example

```typescript
import { 
  convert, 
  encrypt, 
  decrypt, 
  generateKey, 
  deriveKey,
  exportKey,
  importKey,
  isEncrypted 
} from '@playcanvas/splat-transform/browser';

// Convert your file first
const sogBuffer = await convert(file, { outputFormat: 'sog', useGpu: true });

// Option 1: Generate a random key (store securely!)
const key = await generateKey();
const keyString = await exportKey(key); // Save this securely

// Option 2: Derive key from password
const { key, salt } = await deriveKey('my-secret-password');

// Encrypt the data
const { data: encryptedBuffer } = await encrypt(sogBuffer, key);

// The encrypted file can now be safely distributed
// It cannot be opened without the key
```

### Decryption Flow

```typescript
// Later, when loading the encrypted file...
const encryptedData = await fetch('/assets/model.esog').then(r => r.arrayBuffer());

// Check if data is encrypted
if (isEncrypted(encryptedData)) {
  // Option 1: Import stored key
  const key = await importKey(storedKeyString);
  
  // Option 2: Derive from password (need same salt!)
  const salt = extractSalt(encryptedData);
  const { key } = await deriveKey('my-secret-password', { salt });
  
  // Decrypt
  const decryptedBuffer = await decrypt(encryptedData, key);
  
  // Now use the decrypted data
  const dataTable = await read(decryptedBuffer);
}
```

### Encryption Functions

#### `generateKey()`

Generate a random AES-256-GCM encryption key.

**Returns:** `Promise<CryptoKey>` - A cryptographic key for encryption/decryption

```typescript
const key = await generateKey();
```

---

#### `deriveKey(password, options?)`

Derive an encryption key from a password using PBKDF2.

**Parameters:**
- `password`: `string` - The password to derive the key from
- `options?`: `DeriveKeyOptions` - Derivation options

**Returns:** `Promise<{ key: CryptoKey; salt: Uint8Array }>` - The derived key and salt

```typescript
// With auto-generated salt
const { key, salt } = await deriveKey('my-password');

// With custom salt (for recreating key later)
const { key } = await deriveKey('my-password', { 
  salt: existingSalt,
  iterations: 200000 // Higher = more secure but slower
});
```

---

#### `exportKey(key)`

Export a CryptoKey to a base64 string for storage.

**Parameters:**
- `key`: `CryptoKey` - The key to export

**Returns:** `Promise<string>` - Base64-encoded key

```typescript
const keyString = await exportKey(key);
// Store keyString securely (NOT in client-side code!)
```

---

#### `importKey(keyString)`

Import a CryptoKey from a base64 string.

**Parameters:**
- `keyString`: `string` - Base64-encoded key string

**Returns:** `Promise<CryptoKey>` - The imported key

```typescript
const key = await importKey(storedKeyString);
```

---

#### `encrypt(data, key, options?)`

Encrypt data using AES-256-GCM.

**Parameters:**
- `data`: `ArrayBuffer | Uint8Array | Blob` - Data to encrypt
- `key`: `CryptoKey` - Encryption key
- `options?`: `EncryptOptions` - Encryption options

**Returns:** `Promise<EncryptedData>` - Encrypted data with metadata

```typescript
const { data, iv, salt } = await encrypt(sogBuffer, key, {
  salt: derivedSalt // Include if using password-derived key
});
```

---

#### `decrypt(encryptedData, key, options?)`

Decrypt data encrypted with `encrypt()`.

**Parameters:**
- `encryptedData`: `ArrayBuffer | Uint8Array | Blob` - Encrypted data
- `key`: `CryptoKey` - Decryption key
- `options?`: `DecryptOptions` - Decryption options

**Returns:** `Promise<ArrayBuffer>` - Decrypted data

```typescript
const decryptedBuffer = await decrypt(encryptedData, key);
```

---

#### `isEncrypted(data)`

Check if data has a valid encryption header.

**Parameters:**
- `data`: `ArrayBuffer | Uint8Array` - Data to check

**Returns:** `boolean` - True if data appears encrypted

```typescript
if (isEncrypted(buffer)) {
  // Handle encrypted data
}
```

---

#### `extractSalt(data)`

Extract the salt from encrypted data (for password-derived key recreation).

**Parameters:**
- `data`: `ArrayBuffer | Uint8Array` - Encrypted data

**Returns:** `Uint8Array | null` - The salt, or null if a random key was used

```typescript
const salt = extractSalt(encryptedData);
if (salt) {
  // Key was password-derived, can recreate with same password + salt
  const { key } = await deriveKey(password, { salt });
}
```

---

#### `getEncryptionInfo(data)`

Get metadata about encrypted data.

**Parameters:**
- `data`: `ArrayBuffer | Uint8Array` - Data to inspect

**Returns:** `object` - Encryption metadata

```typescript
const info = getEncryptionInfo(buffer);
console.log(info);
// {
//   isEncrypted: true,
//   version: 1,
//   hasPasswordSalt: true,
//   encryptedSize: 1048612,
//   estimatedOriginalSize: 1048560
// }
```

### Encryption Types

```typescript
interface EncryptOptions {
  salt?: Uint8Array;           // Salt for password-derived keys
  additionalData?: Uint8Array; // AAD for integrity verification
}

interface DecryptOptions {
  additionalData?: Uint8Array; // Must match encryption AAD
}

interface EncryptedData {
  data: ArrayBuffer;           // Encrypted data with header
  iv: Uint8Array;              // Initialization vector used
  salt?: Uint8Array;           // Salt if password-derived
}

interface DeriveKeyOptions {
  iterations?: number;         // PBKDF2 iterations (default: 100000)
  salt?: Uint8Array | string;  // Salt for derivation
}
```

### Complete Protection Workflow

```typescript
import {
  convert,
  encrypt,
  decrypt,
  deriveKey,
  isEncrypted,
  extractSalt,
  type ProgressInfo
} from '@playcanvas/splat-transform/browser';

// === CONTENT CREATOR SIDE ===

async function protectAsset(file: File, password: string): Promise<Blob> {
  // 1. Convert to SOG format
  const sogBuffer = await convert(file, {
    outputFormat: 'sog',
    useGpu: true,
    onProgress: (info: ProgressInfo) => console.log(info.message)
  });

  // 2. Derive encryption key from password
  const { key, salt } = await deriveKey(password);

  // 3. Encrypt the data (salt is stored in header)
  const { data: encrypted } = await encrypt(sogBuffer, key, { salt });

  // 4. Return as downloadable blob
  return new Blob([encrypted], { type: 'application/octet-stream' });
}

// === APPLICATION SIDE ===

async function loadProtectedAsset(url: string, password: string): Promise<ArrayBuffer> {
  // 1. Fetch encrypted file
  const response = await fetch(url);
  const encrypted = await response.arrayBuffer();

  // 2. Check if actually encrypted
  if (!isEncrypted(encrypted)) {
    throw new Error('File is not encrypted');
  }

  // 3. Extract salt and recreate key
  const salt = extractSalt(encrypted);
  if (!salt) {
    throw new Error('File was encrypted with random key, not password');
  }

  const { key } = await deriveKey(password, { salt });

  // 4. Decrypt and return
  return decrypt(encrypted, key);
}

// Usage
const protectedBlob = await protectAsset(myFile, 'secret-password-123');
// Upload protectedBlob to CDN...

// Later, in your app:
const splatData = await loadProtectedAsset('/assets/model.esog', 'secret-password-123');
```

### Security Considerations

| Aspect | Recommendation |
|--------|----------------|
| Key Storage | Never embed keys in client-side JavaScript. Use server-side token validation. |
| Password Strength | Use strong, unique passwords (16+ chars with mixed characters). |
| PBKDF2 Iterations | Use 100,000+ iterations for production. |
| Additional Auth Data | Use AAD to bind encrypted data to specific contexts (e.g., user ID). |
| Transport | Always use HTTPS. |
| Fallback | Have a server-side rendering option for high-value assets. |

### Limitations

1. **Not True DRM**: Decrypted data exists in memory and can be extracted by determined attackers.
2. **Key Distribution**: The key must reach the client somehow - this is the weakest link.
3. **No Hardware Binding**: Unlike Widevine/FairPlay, there's no hardware-level protection.
4. **Browser DevTools**: Advanced users can intercept decrypted data.

**Best Use Cases:**
- Preventing casual "Save As" theft
- Adding a layer of protection for semi-public assets
- Time-limited access with server-validated tokens
- Audit trail when combined with watermarking

---

## Obfuscated Crypto API (Advanced)

For stronger protection, use the obfuscated crypto API which splits keys into fragments and uses WASM-based decryption. This makes reverse engineering significantly harder.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│ Standard Encryption (Easy to intercept):                           │
│                                                                     │
│   GET /api/key → { key: "abc123..." }  ← Visible in DevTools       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Obfuscated Crypto (Much harder):                                   │
│                                                                     │
│   GET /api/render/config    → { shaderParams: { seed: "Kx9..." }}  │
│   GET /api/session/validate → { token: { v: "mN2..." }}            │
│   GET /api/assets/metadata  → { compression: { id: "pQ7..." }}     │
│   GET /api/viewer/settings  → { quality: { hint: "rS4..." }}       │
│                                                                     │
│   4 fragments hidden in 4 different API responses                  │
│   ↓                                                                │
│   Combined inside WASM (hard to inspect)                           │
│   ↓                                                                │
│   Decryption happens in WASM memory                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Server-Side: Split the Key

```typescript
import { splitKeyForDelivery, generateSessionToken } from '@playcanvas/splat-transform/browser';

// When preparing an asset for protected delivery
app.post('/api/assets/:id/prepare-view', async (req, res) => {
  const asset = await getAsset(req.params.id);

  // Split the 32-byte key into 4 fragments
  const fragments = splitKeyForDelivery(asset.encryptionKey);
  const sessionToken = generateSessionToken();

  // Store fragments in session (Redis, etc.)
  await redis.setex(`session:${sessionToken}`, 300, JSON.stringify({
    assetId: asset.id,
    fragments,
    fragmentsDelivered: [false, false, false, false]
  }));

  res.json({ sessionToken });
});

// Deliver fragments through innocent-looking endpoints
app.get('/api/render/:assetId/config', async (req, res) => {
  const session = await getSession(req.query.token);
  if (!session || session.fragmentsDelivered[0]) {
    return res.status(403).json({ error: 'Invalid session' });
  }

  session.fragmentsDelivered[0] = true;
  await saveSession(session);

  // Fragment hidden in response
  res.json({
    renderer: 'webgl2',
    quality: 'high',
    shaderParams: {
      bloom: 0.5,
      matrixSeed: session.fragments[0],  // ← Fragment 0
      exposure: 1.2
    }
  });
});

// Similar endpoints for fragments 1, 2, 3...
```

### Client-Side: Collect and Decrypt

```typescript
import {
  createObfuscatedCrypto,
  generateSessionToken
} from '@playcanvas/splat-transform/browser';

async function loadProtectedAsset(assetId: string) {
  // 1. Get session token from your backend
  const { sessionToken } = await fetch(`/api/assets/${assetId}/prepare-view`, {
    method: 'POST'
  }).then(r => r.json());

  // 2. Create obfuscated crypto session
  const crypto = createObfuscatedCrypto(sessionToken);

  // 3. Fetch fragments from multiple endpoints (they look like normal API calls)
  const [config, validation, metadata, settings] = await Promise.all([
    fetch(`/api/render/${assetId}/config?token=${sessionToken}`).then(r => r.json()),
    fetch(`/api/session/${assetId}/validate?token=${sessionToken}`).then(r => r.json()),
    fetch(`/api/assets/${assetId}/metadata?token=${sessionToken}`).then(r => r.json()),
    fetch(`/api/viewer/${assetId}/settings?token=${sessionToken}`).then(r => r.json())
  ]);

  // 4. Extract fragments from responses (attacker must know where to look)
  crypto.setFragment(0, config.shaderParams.matrixSeed);
  crypto.setFragment(1, validation.token.v);
  crypto.setFragment(2, metadata.compression.id);
  crypto.setFragment(3, settings.quality.hint);

  // 5. Verify all fragments received
  if (!crypto.isReady()) {
    throw new Error('Failed to initialize decryption');
  }

  // 6. Fetch encrypted asset from CDN
  const encryptedData = await fetch(`https://cdn.example.com/${assetId}.esog`)
    .then(r => r.arrayBuffer());

  // 7. Decrypt using assembled key (happens in WASM)
  const decryptedData = await crypto.decrypt(encryptedData);

  // 8. Clean up key material
  crypto.destroy();

  return decryptedData;
}
```

### Obfuscated Crypto Functions

#### `createObfuscatedCrypto(sessionToken)`

Create an obfuscated crypto session.

**Parameters:**
- `sessionToken`: `number` - Unique token for this session

**Returns:** `ObfuscatedCrypto` - Crypto session instance

---

#### `splitKeyForDelivery(key)`

Split a 32-byte key into 4 fragments for obfuscated delivery.

**Parameters:**
- `key`: `Uint8Array | string` - The encryption key (32 bytes)

**Returns:** `string[]` - Array of 4 base64-encoded fragments

---

#### `generateSessionToken()`

Generate a random session token.

**Returns:** `number` - Random 32-bit unsigned integer

---

#### `ObfuscatedCrypto.setFragment(index, fragment)`

Set a key fragment.

**Parameters:**
- `index`: `number` - Fragment index (0-3)
- `fragment`: `string | Uint8Array` - The fragment data

---

#### `ObfuscatedCrypto.isReady()`

Check if all 4 fragments have been set.

**Returns:** `boolean` - True if ready to decrypt

---

#### `ObfuscatedCrypto.decrypt(encryptedData)`

Decrypt data using the assembled key.

**Parameters:**
- `encryptedData`: `ArrayBuffer | Uint8Array` - Encrypted data

**Returns:** `Promise<ArrayBuffer>` - Decrypted data

---

#### `ObfuscatedCrypto.destroy()`

Clear all key material from memory.

### Why This Is Harder to Break

| Attack Vector | Standard Encryption | Obfuscated Crypto |
|--------------|--------------------|--------------------|
| Network tab inspection | Key visible in one request | 4 fragments hidden in different responses |
| Copy-paste attack | Copy key, use decrypt tool | Must find 4 fragments + understand assembly |
| Code inspection | `decrypt(key, data)` obvious | Key assembly in WASM, hard to trace |
| Automation | Easy to script | Must replicate fragment extraction logic |
| Time required | Minutes | Hours to days |

### WASM Compilation (Optional)

For maximum security, compile the C crypto module to WASM:

```bash
# Install Emscripten SDK first
cd lib

emcc -O3 crypto.c \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS='["_crypto_init","_crypto_set_key_fragment","_crypto_decrypt","_crypto_free","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","HEAPU8"]' \
  -o crypto.mjs
```

The JavaScript fallback is used by default, but WASM provides:
- Key assembly happens in WASM memory (not visible in JS debugger)
- Compiled binary is harder to reverse engineer than JavaScript
- Memory is more controlled (harder to dump)

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
