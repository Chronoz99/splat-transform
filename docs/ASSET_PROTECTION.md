# Asset Protection Guide

This guide explains how to use the encryption features of `@playcanvas/splat-transform` to protect your 3D Gaussian Splat assets from casual theft and unauthorized redistribution.

## Table of Contents

- [Overview](#overview)
- [Understanding the Threat Model](#understanding-the-threat-model)
- [Basic Encryption](#basic-encryption)
- [Password-Based Encryption](#password-based-encryption)
- [Advanced: Obfuscated Key Delivery](#advanced-obfuscated-key-delivery)
- [Integration Patterns](#integration-patterns)
- [Security Considerations](#security-considerations)
- [API Reference](#api-reference)

---

## Overview

3D Gaussian Splat files (`.ply`, `.splat`, `.sog`, etc.) represent significant creative and computational investment. When serving these assets in web applications, they can be easily downloaded and reused without permission.

This module provides **AES-256-GCM encryption** to protect your assets. While no client-side protection is 100% secure, this implementation:

1. **Prevents casual theft** - Files cannot be opened without the key
2. **Detects tampering** - GCM authentication fails if data is modified
3. **Adds friction** - Attackers must reverse-engineer your key delivery system
4. **Supports multiple patterns** - From simple to sophisticated protection schemes

### Encrypted File Format

Encrypted files use the `.esog`, `.eply`, etc. extensions and have this structure:

```
┌─────────────────────────────────────────┐
│ Header (36 bytes)                       │
├─────────────────────────────────────────┤
│ Magic Bytes: "ESPL" (4 bytes)           │
│ Version: 1 (1 byte)                     │
│ Flags: reserved (3 bytes)               │
│ IV: random (12 bytes)                   │
│ Salt: for password-based keys (16 bytes)│
├─────────────────────────────────────────┤
│ Encrypted Data + Auth Tag               │
│ (original size + 16 bytes)              │
└─────────────────────────────────────────┘
```

---

## Understanding the Threat Model

### What This Protects Against

| Threat | Protection Level |
|--------|------------------|
| Direct URL download | ✅ Strong - File is useless without key |
| Browser DevTools inspection | ✅ Strong - Encrypted bytes only |
| Network traffic interception | ⚠️ Medium - Key delivery is the weak point |
| Memory inspection/debugging | ⚠️ Medium - Keys exist in memory briefly |
| Determined reverse engineering | ❌ Limited - Client-side JS can be analyzed |

### What This Does NOT Protect Against

1. **Determined attackers** with debugging skills can eventually extract keys
2. **Screen recording** - Once rendered, the visual output can be captured
3. **Memory dumps** - Decrypted data exists in GPU/CPU memory during rendering
4. **Legal distribution** - Users with legitimate access can share keys

### Recommended Approach

Use encryption as **one layer** in a defense-in-depth strategy:

1. **Encryption** (this module) - Makes files unusable without keys
2. **Authentication** - Only serve keys to logged-in users
3. **Rate limiting** - Prevent bulk downloading
4. **Watermarking** - Identify the source of leaks
5. **Legal protection** - Terms of service, DMCA, etc.

---

## Basic Encryption

The simplest approach: generate a random key and encrypt the file.

### Encrypting Files (Node.js/Build Time)

```typescript
import { generateKey, exportKey, encrypt } from '@playcanvas/splat-transform';
import { readFileSync, writeFileSync } from 'fs';

async function encryptAsset(inputPath: string, outputPath: string) {
  // Generate a random 256-bit key
  const key = await generateKey();
  
  // Export key as base64 for storage
  const keyBase64 = await exportKey(key);
  console.log('Store this key securely:', keyBase64);
  
  // Read and encrypt the file
  const plainData = readFileSync(inputPath);
  const encrypted = await encrypt(plainData, key);
  
  // Write encrypted file
  writeFileSync(outputPath, Buffer.from(encrypted.data));
  
  return keyBase64;
}

// Usage
const key = await encryptAsset('model.sog', 'model.esog');
// Store 'key' in your database associated with this asset
```

### Decrypting Files (Browser)

```typescript
import { importKey, decrypt, isEncrypted } from '@playcanvas/splat-transform/browser';

async function loadProtectedAsset(url: string, keyBase64: string) {
  // Fetch the encrypted file
  const response = await fetch(url);
  const encryptedData = await response.arrayBuffer();
  
  // Verify it's encrypted
  if (!isEncrypted(encryptedData)) {
    throw new Error('File is not encrypted');
  }
  
  // Import the key and decrypt
  const key = await importKey(keyBase64);
  const decryptedData = await decrypt(encryptedData, key);
  
  return decryptedData;
}

// Usage - key comes from your authenticated API
const key = await fetchKeyFromAPI('/api/assets/model123/key');
const splatData = await loadProtectedAsset('/assets/model123.esog', key);
// Now use splatData with your splat renderer
```

---

## Password-Based Encryption

For scenarios where users provide their own password (e.g., downloadable protected files).

### Encrypting with Password

```typescript
import { deriveKey, encrypt } from '@playcanvas/splat-transform';

async function encryptWithPassword(data: ArrayBuffer, password: string) {
  // Derive key from password (generates random salt internally)
  const { key, salt } = await deriveKey(password);
  
  // Encrypt with the derived key, including salt in options
  const encrypted = await encrypt(data, key, { salt });
  
  return encrypted.data;
  // Salt is stored in the file header automatically
}
```

### Decrypting with Password

```typescript
import { deriveKey, decrypt, extractSalt } from '@playcanvas/splat-transform/browser';

async function decryptWithPassword(encryptedData: ArrayBuffer, password: string) {
  // Extract salt from the encrypted file header
  const salt = extractSalt(encryptedData);
  
  if (!salt) {
    throw new Error('File was not encrypted with a password');
  }
  
  // Derive the same key using the extracted salt
  const { key } = await deriveKey(password, { salt });
  
  // Decrypt
  return await decrypt(encryptedData, key);
}
```

---

## Advanced: Obfuscated Key Delivery

For SaaS applications where you need maximum protection against network interception.

### The Problem

Even with encryption, if an attacker can intercept your API response containing the key, they can decrypt the file. Network inspection in browser DevTools makes this trivial.

### The Solution: Key Fragmentation

Split the key into 4 fragments delivered through separate API endpoints that don't obviously look like key delivery:

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Backend                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Full Key: "abc...xyz" (32 bytes)                         │
│        ↓                                                    │
│   splitKeyForDelivery()                                    │
│        ↓                                                    │
│   Fragment 0 ─→ /api/render/config      (looks like config)│
│   Fragment 1 ─→ /api/session/validate   (looks like auth)  │
│   Fragment 2 ─→ /api/assets/metadata    (looks like meta)  │
│   Fragment 3 ─→ /api/viewer/settings    (looks like prefs) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                     Browser Client                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   const crypto = createObfuscatedCrypto(sessionToken);     │
│                                                             │
│   // Fragments arrive via different API calls              │
│   crypto.setFragment(0, configResponse.renderKey);         │
│   crypto.setFragment(1, sessionResponse.token);            │
│   crypto.setFragment(2, metaResponse.signature);           │
│   crypto.setFragment(3, settingsResponse.preference);      │
│                                                             │
│   // Key is assembled only at decrypt time                 │
│   const decrypted = await crypto.decrypt(encryptedFile);   │
│                                                             │
│   // Clean up                                               │
│   crypto.destroy();                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Backend Implementation (Node.js)

```typescript
import { splitKeyForDelivery, generateSessionToken } from '@playcanvas/splat-transform';

// Store encryption keys in your database
const assetKeys = new Map<string, string>(); // assetId -> keyBase64

// Endpoint 1: Render configuration
app.get('/api/render/:assetId/config', authenticate, (req, res) => {
  const key = assetKeys.get(req.params.assetId);
  const fragments = splitKeyForDelivery(key);
  
  res.json({
    quality: 'high',
    renderKey: fragments[0],  // Hidden in plain sight
    antialiasing: true
  });
});

// Endpoint 2: Session validation
app.get('/api/session/:assetId/validate', authenticate, (req, res) => {
  const key = assetKeys.get(req.params.assetId);
  const fragments = splitKeyForDelivery(key);
  
  res.json({
    valid: true,
    token: fragments[1],  // Looks like a session token
    expiresIn: 3600
  });
});

// Endpoint 3: Asset metadata
app.get('/api/assets/:assetId/metadata', authenticate, (req, res) => {
  const key = assetKeys.get(req.params.assetId);
  const fragments = splitKeyForDelivery(key);
  
  res.json({
    name: 'Model Name',
    signature: fragments[2],  // Looks like a signature
    created: '2024-01-01'
  });
});

// Endpoint 4: Viewer settings
app.get('/api/viewer/:assetId/settings', authenticate, (req, res) => {
  const key = assetKeys.get(req.params.assetId);
  const fragments = splitKeyForDelivery(key);
  
  res.json({
    theme: 'dark',
    preference: fragments[3],  // Looks like user preference
    autoRotate: false
  });
});
```

### Frontend Implementation

```typescript
import { 
  createObfuscatedCrypto, 
  generateSessionToken 
} from '@playcanvas/splat-transform/browser';

async function loadProtectedAssetAdvanced(assetId: string) {
  const sessionToken = generateSessionToken();
  const crypto = createObfuscatedCrypto(sessionToken);
  
  try {
    // Fetch fragments from different endpoints (in parallel for speed)
    const [config, session, metadata, settings] = await Promise.all([
      fetch(`/api/render/${assetId}/config`).then(r => r.json()),
      fetch(`/api/session/${assetId}/validate`).then(r => r.json()),
      fetch(`/api/assets/${assetId}/metadata`).then(r => r.json()),
      fetch(`/api/viewer/${assetId}/settings`).then(r => r.json())
    ]);
    
    // Set fragments (order doesn't matter)
    crypto.setFragment(0, config.renderKey);
    crypto.setFragment(1, session.token);
    crypto.setFragment(2, metadata.signature);
    crypto.setFragment(3, settings.preference);
    
    // Verify all fragments received
    if (!crypto.isReady()) {
      throw new Error('Failed to receive all key fragments');
    }
    
    // Fetch and decrypt the asset
    const encryptedResponse = await fetch(`/assets/${assetId}.esog`);
    const encryptedData = await encryptedResponse.arrayBuffer();
    
    const decryptedData = await crypto.decrypt(encryptedData);
    
    return decryptedData;
  } finally {
    // Always clean up key material
    crypto.destroy();
  }
}
```

---

## Integration Patterns

### Pattern 1: Static Site with API Key Delivery

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   CDN        │     │  Your API    │     │  Database    │
│ (encrypted   │     │  (keys)      │     │  (key store) │
│  assets)     │     │              │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │    1. Fetch .esog  │                    │
       │◄───────────────────│                    │
       │                    │                    │
       │    2. Auth + Get Key                    │
       │                    │◄───────────────────│
       │                    │                    │
       │    3. Return key   │                    │
       │◄───────────────────│                    │
       │                    │                    │
       ▼                    │                    │
  [Browser decrypts]        │                    │
```

**Pros:** Simple, encrypted files can be cached on CDN
**Cons:** Key endpoint is a single point of interception

### Pattern 2: Signed URL with Embedded Key

Generate time-limited URLs that include encrypted key data:

```typescript
// Backend
function generateSignedUrl(assetId: string, userId: string) {
  const key = getAssetKey(assetId);
  const expires = Date.now() + 3600000; // 1 hour
  
  const payload = JSON.stringify({ key, assetId, userId, expires });
  const encrypted = encryptWithServerKey(payload);
  const signature = hmacSign(encrypted);
  
  return `/assets/${assetId}.esog?token=${encrypted}&sig=${signature}`;
}

// Frontend
async function loadFromSignedUrl(signedUrl: string) {
  const url = new URL(signedUrl);
  const token = url.searchParams.get('token');
  
  // Send token to backend to get decrypted key
  const { key } = await fetch('/api/decrypt-token', {
    method: 'POST',
    body: JSON.stringify({ token })
  }).then(r => r.json());
  
  // Fetch and decrypt asset
  const encrypted = await fetch(signedUrl).then(r => r.arrayBuffer());
  return decrypt(encrypted, await importKey(key));
}
```

### Pattern 3: Streaming Decryption (Large Files)

For very large splat files, decrypt in chunks:

```typescript
async function streamDecrypt(url: string, key: CryptoKey) {
  const response = await fetch(url);
  const reader = response.body.getReader();
  
  // Read header first (36 bytes)
  const headerChunks = [];
  let headerSize = 0;
  while (headerSize < 36) {
    const { value } = await reader.read();
    headerChunks.push(value);
    headerSize += value.length;
  }
  
  // Parse IV from header
  const header = concatenate(headerChunks).slice(0, 36);
  const iv = header.slice(8, 20);
  
  // Stream decrypt remaining data
  // Note: Full implementation requires chunked GCM or different cipher mode
}
```

---

## Security Considerations

### Key Storage

| Location | Security | Recommendation |
|----------|----------|----------------|
| Environment variables | Medium | ✅ Good for server-side |
| Database (encrypted) | High | ✅ Best for production |
| Hardcoded in source | Very Low | ❌ Never do this |
| LocalStorage | Low | ❌ Avoid - easily accessible |
| Memory only | High | ✅ Best for browser, clean up after use |

### Key Rotation

Implement key rotation for long-lived assets:

```typescript
// Store multiple key versions
interface AssetKeyRecord {
  assetId: string;
  keyVersion: number;
  key: string;
  createdAt: Date;
  expiresAt: Date | null;
}

// Re-encrypt asset with new key periodically
async function rotateAssetKey(assetId: string) {
  const oldRecord = await getLatestKey(assetId);
  const newKey = await generateKey();
  
  // Re-encrypt the asset
  const encrypted = await fetchAsset(assetId);
  const decrypted = await decrypt(encrypted, await importKey(oldRecord.key));
  const reEncrypted = await encrypt(decrypted, newKey);
  
  // Store new version
  await saveAsset(assetId, reEncrypted.data);
  await saveKey({
    assetId,
    keyVersion: oldRecord.keyVersion + 1,
    key: await exportKey(newKey),
    createdAt: new Date(),
    expiresAt: null
  });
  
  // Mark old key as expiring
  await expireKey(oldRecord.keyVersion, new Date(Date.now() + 86400000));
}
```

### Rate Limiting

Prevent bulk key extraction:

```typescript
import rateLimit from 'express-rate-limit';

const keyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 key requests per window
  message: 'Too many key requests'
});

app.use('/api/*/key', keyLimiter);
```

### Monitoring

Log suspicious activity:

```typescript
function logKeyAccess(userId: string, assetId: string, ip: string) {
  // Log for anomaly detection
  logger.info('key_access', { userId, assetId, ip, timestamp: Date.now() });
  
  // Alert on unusual patterns
  const recentAccess = await getRecentKeyAccess(userId, '1h');
  if (recentAccess.length > 50) {
    alertSecurityTeam(`Unusual key access: ${userId} requested ${recentAccess.length} keys`);
  }
}
```

---

## API Reference

### Encryption Functions

```typescript
// Generate a random AES-256 key
generateKey(): Promise<CryptoKey>

// Derive key from password (PBKDF2, 100k iterations)
deriveKey(password: string, options?: DeriveKeyOptions): Promise<{ key: CryptoKey; salt: Uint8Array }>

// Export key to base64 string
exportKey(key: CryptoKey): Promise<string>

// Import key from base64 string
importKey(keyString: string): Promise<CryptoKey>

// Encrypt data
encrypt(data: ArrayBuffer | Uint8Array | Blob, key: CryptoKey, options?: EncryptOptions): Promise<EncryptedData>

// Decrypt data
decrypt(encryptedData: ArrayBuffer | Uint8Array | Blob, key: CryptoKey, options?: DecryptOptions): Promise<ArrayBuffer>

// Check if data is encrypted (has ESPL header)
isEncrypted(data: ArrayBuffer | Uint8Array): boolean

// Extract salt from encrypted file (for password-based decryption)
extractSalt(data: ArrayBuffer | Uint8Array): Uint8Array | null

// Get encryption metadata
getEncryptionInfo(data: ArrayBuffer | Uint8Array): { isEncrypted: boolean; version?: number; hasPasswordSalt?: boolean }
```

### Obfuscated Crypto Functions

```typescript
// Split key into 4 fragments
splitKeyForDelivery(key: Uint8Array | string): string[]

// Generate random session token
generateSessionToken(): number

// Create obfuscated crypto session
createObfuscatedCrypto(sessionToken: number): ObfuscatedCrypto

// ObfuscatedCrypto class methods
class ObfuscatedCrypto {
  setFragment(index: number, fragment: string | Uint8Array): void
  isReady(): boolean
  decrypt(encryptedData: ArrayBuffer): Promise<ArrayBuffer>
  destroy(): void
}
```

### Types

```typescript
interface EncryptOptions {
  salt?: Uint8Array;           // Include if using password-derived key
  additionalData?: Uint8Array; // Additional authenticated data (AAD)
}

interface DecryptOptions {
  additionalData?: Uint8Array; // Must match encryption AAD
}

interface DeriveKeyOptions {
  iterations?: number;         // PBKDF2 iterations (default: 100000)
  salt?: Uint8Array | string;  // Provide for decryption, omit to generate
}

interface EncryptedData {
  data: ArrayBuffer;           // The encrypted file with header
  iv: Uint8Array;              // The IV used (also in header)
  salt?: Uint8Array;           // The salt if password-derived
}
```

---

## Troubleshooting

### "Decryption failed: invalid key or corrupted data"

1. **Wrong key** - Ensure you're using the exact key used for encryption
2. **Corrupted file** - The encrypted file was modified in transit
3. **Wrong password** - For password-based encryption, password must match exactly
4. **Truncated file** - Download may have been interrupted

### "File is not encrypted (missing ESPL header)"

The file doesn't have the encryption header. Either:
1. It was never encrypted
2. It's an older format
3. The first 4 bytes were corrupted

### "Fragment must be 8 bytes"

When using obfuscated crypto, each fragment must be exactly 8 bytes (encoded as ~12 char base64). Ensure your backend is using `splitKeyForDelivery()` correctly.

### Performance Considerations

| File Size | Encryption Time | Decryption Time |
|-----------|-----------------|-----------------|
| 1 MB      | ~10ms           | ~10ms           |
| 10 MB     | ~50ms           | ~50ms           |
| 100 MB    | ~500ms          | ~500ms          |
| 1 GB      | ~5s             | ~5s             |

For very large files (>100MB), consider:
1. Showing a loading indicator during decryption
2. Using Web Workers to avoid blocking the main thread
3. Implementing streaming decryption

---

## License

This encryption module is part of `@playcanvas/splat-transform` and is licensed under the MIT License.
