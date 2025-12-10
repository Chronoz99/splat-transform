/**
 * Obfuscated Decryption Module
 *
 * This module provides a WASM-based decryption system that makes it significantly
 * harder to extract encryption keys through browser developer tools.
 *
 * How it works:
 * 1. Keys are split into 4 fragments before being sent to the client
 * 2. Each fragment is delivered through separate channels/requests
 * 3. Fragments are passed to WASM where they're XORed with session-specific masks
 * 4. The full key is only assembled inside WASM memory at decrypt time
 * 5. After decryption, all key material is zeroed
 *
 * This doesn't make extraction impossible, but requires:
 * - Understanding the fragment splitting scheme
 * - Reverse engineering the WASM binary
 * - Intercepting multiple requests and combining them correctly
 *
 * For most attackers, this is not worth the effort.
 */

// Since we can't distribute compiled WASM in this PR, this module provides
// a JavaScript fallback that mimics the WASM API structure.
// In production, replace the fallback with actual WASM module.

/**
 * Split a key into 4 fragments for obfuscated delivery
 * Call this server-side when preparing key for delivery
 *
 * @param key - The full encryption key (32 bytes as Uint8Array or base64 string)
 * @returns Array of 4 fragments, each 8 bytes as base64 strings
 */
export function splitKeyForDelivery(key: Uint8Array | string): string[] {
    let keyBytes: Uint8Array;

    if (typeof key === 'string') {
        // Decode base64
        const binary = atob(key);
        keyBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            keyBytes[i] = binary.charCodeAt(i);
        }
    } else {
        keyBytes = key;
    }

    if (keyBytes.length !== 32) {
        throw new Error('Key must be 32 bytes (AES-256)');
    }

    // Split into 4 fragments of 8 bytes each
    const fragments: string[] = [];
    for (let i = 0; i < 4; i++) {
        const fragment = keyBytes.slice(i * 8, (i + 1) * 8);
        fragments.push(btoa(String.fromCharCode(...fragment)));
    }

    return fragments;
}

/**
 * Configuration for the obfuscated crypto session
 */
export interface ObfuscatedCryptoConfig {
    /**
     * Session token for mask generation (should be unique per session)
     */
    sessionToken: number;

    /**
     * Whether to use WASM implementation (falls back to JS if unavailable)
     */
    preferWasm?: boolean;
}

/**
 * Obfuscated crypto session
 * Handles fragment collection and decryption
 */
export class ObfuscatedCrypto {
    private sessionToken: number;
    private fragments: (Uint8Array | null)[] = [null, null, null, null];
    private masks: Uint8Array[] = [];
    private initialized = false;
    private useWasm = false;

    constructor(config: ObfuscatedCryptoConfig) {
        this.sessionToken = config.sessionToken;
        this.generateMasks();
        this.initialized = true;

        // Try to load WASM module if preferred
        if (config.preferWasm !== false) {
            this.tryLoadWasm();
        }
    }

    /**
     * Generate obfuscation masks based on session token
     */
    private generateMasks(): void {
        for (let i = 0; i < 4; i++) {
            const mask = new Uint8Array(8);
            let seed = this.sessionToken ^ (i * 0x9E3779B9);

            for (let j = 0; j < 8; j++) {
                seed = Math.imul(seed, 1103515245) + 12345;
                mask[j] = (seed >>> 16) & 0xFF;
            }

            this.masks.push(mask);
        }
    }

    /**
     * Try to load the WASM module
     */
    private tryLoadWasm(): void {
        // Dynamic import of WASM module would go here
        // In production: import('./crypto.mjs')
        // For now, we use the JS fallback
        this.useWasm = false;
    }

    /**
     * Add a key fragment
     *
     * @param index - Fragment index (0-3)
     * @param fragment - Fragment data as base64 string or Uint8Array
     */
    setFragment(index: number, fragment: string | Uint8Array): void {
        if (index < 0 || index > 3) {
            throw new Error('Fragment index must be 0-3');
        }

        let fragmentBytes: Uint8Array;

        if (typeof fragment === 'string') {
            const binary = atob(fragment);
            fragmentBytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                fragmentBytes[i] = binary.charCodeAt(i);
            }
        } else {
            fragmentBytes = fragment;
        }

        if (fragmentBytes.length !== 8) {
            throw new Error('Fragment must be 8 bytes');
        }

        // Store fragment XORed with mask (obfuscated)
        const obfuscated = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
            obfuscated[i] = fragmentBytes[i] ^ this.masks[index][i];
        }

        this.fragments[index] = obfuscated;
    }

    /**
     * Check if all fragments have been set
     * @returns True if all 4 fragments are set
     */
    isReady(): boolean {
        return this.fragments.every(f => f !== null);
    }

    /**
     * Reconstruct the key from fragments (internal use)
     * @returns The reconstructed 32-byte key
     */
    private reconstructKey(): Uint8Array {
        if (!this.isReady()) {
            throw new Error('Not all key fragments have been set');
        }

        const key = new Uint8Array(32);

        for (let f = 0; f < 4; f++) {
            const fragment = this.fragments[f]!;
            for (let i = 0; i < 8; i++) {
                // De-obfuscate: XOR with mask again to recover original
                key[f * 8 + i] = fragment[i] ^ this.masks[f][i];
            }
        }

        return key;
    }

    /**
     * Decrypt data using the assembled key
     *
     * @param encryptedData - Encrypted data (with header from encrypt())
     * @returns Decrypted data
     */
    async decrypt(encryptedData: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
        if (!this.isReady()) {
            throw new Error('Not all key fragments have been set');
        }

        const data = encryptedData instanceof Uint8Array ?
            encryptedData :
            new Uint8Array(encryptedData);

        // Validate header (ESPL magic bytes)
        if (data.length < 36 ||
            data[0] !== 0x45 || data[1] !== 0x53 ||
            data[2] !== 0x50 || data[3] !== 0x4c) {
            throw new Error('Invalid encrypted data format');
        }

        // Extract IV from header (bytes 8-19)
        const iv = data.slice(8, 20);

        // Extract ciphertext (after 36-byte header)
        const ciphertext = data.slice(36);

        // Reconstruct key
        const key = this.reconstructKey();

        try {
            // Import key for Web Crypto API - use slice to get a proper ArrayBuffer
            const keyBuffer = (key.buffer as ArrayBuffer).slice(
                key.byteOffset,
                key.byteOffset + key.byteLength
            );

            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            // Decrypt
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                cryptoKey,
                ciphertext
            );

            return plaintext;
        } finally {
            // Clear key from memory (best effort)
            key.fill(0);
        }
    }

    /**
     * Clear all key material
     */
    destroy(): void {
        for (const fragment of this.fragments) {
            if (fragment) fragment.fill(0);
        }
        this.fragments = [null, null, null, null];

        for (const mask of this.masks) {
            mask.fill(0);
        }
        this.masks = [];

        this.initialized = false;
    }
}

/**
 * Create an obfuscated crypto session
 *
 * @param sessionToken - Unique token for this session (use crypto.getRandomValues)
 * @returns ObfuscatedCrypto instance
 *
 * @example
 * ```typescript
 * // Generate session token
 * const tokenArray = new Uint32Array(1);
 * crypto.getRandomValues(tokenArray);
 * const sessionToken = tokenArray[0];
 *
 * // Create crypto session
 * const cryptoSession = createObfuscatedCrypto(sessionToken);
 *
 * // Receive fragments from separate API calls
 * cryptoSession.setFragment(0, await fetchFragment('/api/k/0'));
 * cryptoSession.setFragment(1, await fetchFragment('/api/k/1'));
 * cryptoSession.setFragment(2, await fetchFragment('/api/k/2'));
 * cryptoSession.setFragment(3, await fetchFragment('/api/k/3'));
 *
 * // Decrypt the data
 * const decrypted = await cryptoSession.decrypt(encryptedBuffer);
 *
 * // Clean up
 * cryptoSession.destroy();
 * ```
 */
export function createObfuscatedCrypto(sessionToken: number): ObfuscatedCrypto {
    return new ObfuscatedCrypto({ sessionToken });
}

/**
 * Helper to generate a random session token
 * @returns A random 32-bit unsigned integer
 */
export function generateSessionToken(): number {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0];
}

/**
 * Server-side helper: Split key and create delivery URLs
 * This is a reference implementation - adapt for your backend
 *
 * @param key - The encryption key
 * @param baseUrl - Base URL for fragment endpoints
 * @param assetId - Asset identifier
 * @returns Object with fragments and URLs
 */
export function prepareKeyDelivery(
    key: string | Uint8Array,
    baseUrl: string,
    assetId: string
): {
    fragments: string[];
    urls: string[];
    sessionToken: number;
} {
    const fragments = splitKeyForDelivery(key);
    const sessionToken = generateSessionToken();

    // Generate URLs that don't obviously look like key fragments
    const endpoints = [
        `/api/render/${assetId}/config`,
        `/api/session/${assetId}/validate`,
        `/api/assets/${assetId}/metadata`,
        `/api/viewer/${assetId}/settings`
    ];

    const urls = endpoints.map(ep => `${baseUrl}${ep}`);

    return { fragments, urls, sessionToken };
}
