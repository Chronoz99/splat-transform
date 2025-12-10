/**
 * Encryption utilities for protecting splat assets
 *
 * This module provides AES-256-GCM encryption for splat files to prevent
 * casual asset theft. While not unbreakable DRM, it significantly raises
 * the barrier for unauthorized extraction.
 *
 * IMPORTANT: This is obfuscation, not true DRM. A determined attacker with
 * access to the decryption key (which must exist in memory for rendering)
 * can still extract the data. Use this as one layer in a defense-in-depth
 * strategy.
 *
 * @example
 * ```typescript
 * import { encrypt, decrypt, generateKey, deriveKey } from '@playcanvas/splat-transform/browser';
 *
 * // Generate a random key
 * const key = await generateKey();
 *
 * // Or derive from password
 * const key = await deriveKey('my-secret-password', 'unique-salt');
 *
 * // Encrypt splat data
 * const encrypted = await encrypt(splatBuffer, key);
 *
 * // Decrypt when needed
 * const decrypted = await decrypt(encrypted, key);
 * ```
 */

// Magic bytes to identify encrypted splat files: "ESPL" (Encrypted SPLat)
const MAGIC_BYTES = new Uint8Array([0x45, 0x53, 0x50, 0x4c]);
const VERSION = 1;

// AES-GCM configuration
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const SALT_LENGTH = 16;
const TAG_LENGTH = 128; // bits

/**
 * Header structure for encrypted files:
 * - 4 bytes: Magic ("ESPL")
 * - 1 byte: Version
 * - 1 byte: Flags (reserved for future use)
 * - 2 bytes: Reserved
 * - 12 bytes: IV (Initialization Vector)
 * - 16 bytes: Salt (if password-derived, otherwise zeros)
 * Total: 36 bytes
 */
const HEADER_SIZE = 36;

/**
 * Encryption options
 */
export interface EncryptOptions {
    /**
     * Optional salt for key derivation (only needed if key was derived from password)
     * If provided, it will be stored in the header for decryption
     */
    salt?: Uint8Array;

    /**
     * Add additional authenticated data (AAD) for integrity verification
     * This data is not encrypted but is authenticated
     */
    additionalData?: Uint8Array;
}

/**
 * Decryption options
 */
export interface DecryptOptions {
    /**
     * Additional authenticated data that was used during encryption
     * Must match exactly or decryption will fail
     */
    additionalData?: Uint8Array;
}

/**
 * Result of encryption operation
 */
export interface EncryptedData {
    /**
     * The encrypted data including header
     */
    data: ArrayBuffer;

    /**
     * The IV used for encryption (also stored in header)
     */
    iv: Uint8Array;

    /**
     * The salt used if key was password-derived (also stored in header)
     */
    salt?: Uint8Array;
}

/**
 * Key derivation options for password-based keys
 */
export interface DeriveKeyOptions {
    /**
     * Number of PBKDF2 iterations (default: 100000)
     * Higher = more secure but slower
     */
    iterations?: number;

    /**
     * Salt for key derivation
     * If not provided, a random salt will be generated
     */
    salt?: Uint8Array | string;
}

/**
 * Generate a random encryption key
 * @returns A CryptoKey suitable for AES-256-GCM encryption
 */
export async function generateKey(): Promise<CryptoKey> {
    const key = await crypto.subtle.generateKey(
        {
            name: ALGORITHM,
            length: KEY_LENGTH
        },
        true, // extractable
        ['encrypt', 'decrypt']
    );
    return key;
}

/**
 * Derive an encryption key from a password
 * @param password - The password to derive the key from
 * @param options - Key derivation options
 * @returns Object containing the derived CryptoKey and salt used
 */
export async function deriveKey(
    password: string,
    options: DeriveKeyOptions = {}
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
    const iterations = options.iterations ?? 100000;

    // Generate or use provided salt
    let salt: Uint8Array;
    if (options.salt) {
        if (typeof options.salt === 'string') {
            salt = new TextEncoder().encode(options.salt);
        } else {
            salt = options.salt;
        }
    } else {
        salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    }

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derive the actual encryption key
    // Create a new Uint8Array with a proper ArrayBuffer to satisfy TypeScript
    const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: ALGORITHM,
            length: KEY_LENGTH
        },
        true, // extractable
        ['encrypt', 'decrypt']
    );

    return { key, salt };
}

/**
 * Export a CryptoKey to a base64 string for storage
 * @param key - The CryptoKey to export
 * @returns Base64-encoded key string
 */
export async function exportKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/**
 * Import a CryptoKey from a base64 string
 * @param keyString - Base64-encoded key string
 * @returns The imported CryptoKey
 */
export async function importKey(keyString: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(keyString), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        'raw',
        raw,
        {
            name: ALGORITHM,
            length: KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );
    return key;
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - The data to encrypt (ArrayBuffer, Uint8Array, or Blob)
 * @param key - The encryption key
 * @param options - Encryption options
 * @returns Encrypted data with header
 */
export async function encrypt(
    data: ArrayBuffer | Uint8Array | Blob,
    key: CryptoKey,
    options: EncryptOptions = {}
): Promise<EncryptedData> {
    // Convert input to ArrayBuffer
    let plaintext: ArrayBuffer;
    if (data instanceof Blob) {
        plaintext = await data.arrayBuffer();
    } else if (data instanceof Uint8Array) {
        plaintext = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
        plaintext = data;
    }

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Prepare salt (zeros if not password-derived)
    const salt = options.salt ?? new Uint8Array(SALT_LENGTH);

    // Build encryption params
    const encryptParams: {
        name: string;
        iv: Uint8Array;
        tagLength: number;
        additionalData?: ArrayBuffer;
    } = {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH
    };
    if (options.additionalData) {
        encryptParams.additionalData = new Uint8Array(options.additionalData).buffer as ArrayBuffer;
    }

    // Encrypt the data
    const ciphertext = await crypto.subtle.encrypt(
        encryptParams,
        key,
        plaintext
    );

    // Build the output buffer: header + ciphertext
    const output = new ArrayBuffer(HEADER_SIZE + ciphertext.byteLength);
    const outputView = new Uint8Array(output);

    // Write header
    outputView.set(MAGIC_BYTES, 0); // Magic bytes
    outputView[4] = VERSION; // Version
    outputView[5] = 0; // Flags (reserved)
    outputView[6] = 0; // Reserved
    outputView[7] = 0; // Reserved
    outputView.set(iv, 8); // IV at offset 8
    outputView.set(salt, 8 + IV_LENGTH); // Salt at offset 20

    // Write ciphertext
    outputView.set(new Uint8Array(ciphertext), HEADER_SIZE);

    return {
        data: output,
        iv: iv,
        salt: options.salt ? salt : undefined
    };
}

/**
 * Decrypt data encrypted with encrypt()
 * @param encryptedData - The encrypted data (with header)
 * @param key - The decryption key
 * @param options - Decryption options
 * @returns Decrypted data as ArrayBuffer
 */
export async function decrypt(
    encryptedData: ArrayBuffer | Uint8Array | Blob,
    key: CryptoKey,
    options: DecryptOptions = {}
): Promise<ArrayBuffer> {
    // Convert input to ArrayBuffer
    let data: ArrayBuffer;
    if (encryptedData instanceof Blob) {
        data = await encryptedData.arrayBuffer();
    } else if (encryptedData instanceof Uint8Array) {
        data = (encryptedData.buffer as ArrayBuffer).slice(
            encryptedData.byteOffset,
            encryptedData.byteOffset + encryptedData.byteLength
        );
    } else {
        data = encryptedData;
    }

    // Validate minimum size
    if (data.byteLength < HEADER_SIZE) {
        throw new Error('Invalid encrypted data: too small');
    }

    const view = new Uint8Array(data);

    // Validate magic bytes
    if (
        view[0] !== MAGIC_BYTES[0] ||
        view[1] !== MAGIC_BYTES[1] ||
        view[2] !== MAGIC_BYTES[2] ||
        view[3] !== MAGIC_BYTES[3]
    ) {
        throw new Error('Invalid encrypted data: missing magic bytes. File may not be encrypted or is corrupted.');
    }

    // Validate version
    const version = view[4];
    if (version !== VERSION) {
        throw new Error(`Unsupported encryption version: ${version}`);
    }

    // Extract IV
    const iv = view.slice(8, 8 + IV_LENGTH);

    // Extract ciphertext
    const ciphertext = data.slice(HEADER_SIZE);

    // Build decryption params
    const decryptParams: {
        name: string;
        iv: Uint8Array;
        tagLength: number;
        additionalData?: ArrayBuffer;
    } = {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH
    };
    if (options.additionalData) {
        decryptParams.additionalData = new Uint8Array(options.additionalData).buffer as ArrayBuffer;
    }

    // Decrypt
    try {
        const plaintext = await crypto.subtle.decrypt(
            decryptParams,
            key,
            ciphertext
        );

        return plaintext;
    } catch (error) {
        throw new Error('Decryption failed: invalid key or corrupted data');
    }
}

/**
 * Check if data appears to be encrypted (has valid header)
 * @param data - The data to check
 * @returns True if data has valid encryption header
 */
export function isEncrypted(data: ArrayBuffer | Uint8Array): boolean {
    const view = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (view.byteLength < HEADER_SIZE) {
        return false;
    }

    return (
        view[0] === MAGIC_BYTES[0] &&
        view[1] === MAGIC_BYTES[1] &&
        view[2] === MAGIC_BYTES[2] &&
        view[3] === MAGIC_BYTES[3]
    );
}

/**
 * Extract the salt from encrypted data (for password-derived key recreation)
 * @param data - The encrypted data
 * @returns The salt if present, or null if all zeros (random key was used)
 */
export function extractSalt(data: ArrayBuffer | Uint8Array): Uint8Array | null {
    const view = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (!isEncrypted(view)) {
        throw new Error('Data is not encrypted');
    }

    const salt = view.slice(8 + IV_LENGTH, 8 + IV_LENGTH + SALT_LENGTH);

    // Check if salt is all zeros (indicates random key was used)
    const isZero = salt.every(b => b === 0);
    return isZero ? null : salt;
}

/**
 * Get encryption metadata from encrypted data
 * @param data - The encrypted data
 * @returns Metadata about the encrypted file
 */
export function getEncryptionInfo(data: ArrayBuffer | Uint8Array): {
    isEncrypted: boolean;
    version?: number;
    hasPasswordSalt: boolean;
    encryptedSize: number;
    estimatedOriginalSize: number;
} {
    const view = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (!isEncrypted(view)) {
        return {
            isEncrypted: false,
            hasPasswordSalt: false,
            encryptedSize: view.byteLength,
            estimatedOriginalSize: view.byteLength
        };
    }

    const salt = view.slice(8 + IV_LENGTH, 8 + IV_LENGTH + SALT_LENGTH);
    const hasPasswordSalt = !salt.every(b => b === 0);

    // AES-GCM adds 16 bytes for the auth tag
    const estimatedOriginalSize = view.byteLength - HEADER_SIZE - 16;

    return {
        isEncrypted: true,
        version: view[4],
        hasPasswordSalt,
        encryptedSize: view.byteLength,
        estimatedOriginalSize: Math.max(0, estimatedOriginalSize)
    };
}
