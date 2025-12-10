/**
 * Unit tests for encryption utilities
 */
import { describe, it, expect } from 'vitest';
import {
    generateKey,
    deriveKey,
    exportKey,
    importKey,
    encrypt,
    decrypt,
    isEncrypted,
    extractSalt,
    getEncryptionInfo
} from '../../src/utils/encryption';

describe('Encryption Utilities', () => {
    describe('generateKey', () => {
        it('should generate a valid CryptoKey', async () => {
            const key = await generateKey();
            expect(key).toBeDefined();
            expect(key.type).toBe('secret');
            expect(key.algorithm.name).toBe('AES-GCM');
        });
    });

    describe('deriveKey', () => {
        it('should derive a key from password', async () => {
            const { key, salt } = await deriveKey('test-password');
            expect(key).toBeDefined();
            expect(key.type).toBe('secret');
            expect(salt).toBeInstanceOf(Uint8Array);
            expect(salt.length).toBe(16);
        });

        it('should derive the same key with same password and salt', async () => {
            const { key: key1, salt } = await deriveKey('test-password');
            const { key: key2 } = await deriveKey('test-password', { salt });

            const exported1 = await exportKey(key1);
            const exported2 = await exportKey(key2);

            expect(exported1).toBe(exported2);
        });
    });

    describe('exportKey / importKey', () => {
        it('should roundtrip a key through export/import', async () => {
            const originalKey = await generateKey();
            const exported = await exportKey(originalKey);
            const importedKey = await importKey(exported);

            // Verify by encrypting/decrypting with both keys
            const testData = new TextEncoder().encode('Hello, World!');
            const { data: encrypted } = await encrypt(testData, originalKey);
            const decrypted = await decrypt(encrypted, importedKey);

            expect(new Uint8Array(decrypted)).toEqual(testData);
        });
    });

    describe('encrypt / decrypt', () => {
        it('should encrypt and decrypt data correctly', async () => {
            const key = await generateKey();
            const testData = new TextEncoder().encode('Secret message!');

            const { data: encrypted } = await encrypt(testData, key);
            const decrypted = await decrypt(encrypted, key);

            expect(new Uint8Array(decrypted)).toEqual(testData);
        });

        it('should produce different ciphertext for same plaintext (random IV)', async () => {
            const key = await generateKey();
            const testData = new TextEncoder().encode('Same data');

            const { data: encrypted1 } = await encrypt(testData, key);
            const { data: encrypted2 } = await encrypt(testData, key);

            // Encrypted data should be different due to random IV
            expect(new Uint8Array(encrypted1)).not.toEqual(new Uint8Array(encrypted2));

            // But both should decrypt to the same plaintext
            const decrypted1 = await decrypt(encrypted1, key);
            const decrypted2 = await decrypt(encrypted2, key);

            expect(new Uint8Array(decrypted1)).toEqual(testData);
            expect(new Uint8Array(decrypted2)).toEqual(testData);
        });

        it('should fail with wrong key', async () => {
            const key1 = await generateKey();
            const key2 = await generateKey();
            const testData = new TextEncoder().encode('Secret');

            const { data: encrypted } = await encrypt(testData, key1);

            await expect(decrypt(encrypted, key2)).rejects.toThrow('Decryption failed');
        });

        it('should handle large data', async () => {
            const key = await generateKey();
            // 100KB of data (getRandomValues limited to 65536 bytes)
            const testData = new Uint8Array(100 * 1024);
            // Fill with pattern instead of random for larger sizes
            for (let i = 0; i < testData.length; i++) {
                testData[i] = i % 256;
            }

            const { data: encrypted } = await encrypt(testData, key);
            const decrypted = await decrypt(encrypted, key);

            expect(new Uint8Array(decrypted)).toEqual(testData);
        });

        it('should work with Blob input', async () => {
            const key = await generateKey();
            const testData = new Blob(['Hello from Blob!'], { type: 'text/plain' });

            const { data: encrypted } = await encrypt(testData, key);
            const decrypted = await decrypt(encrypted, key);

            expect(new TextDecoder().decode(decrypted)).toBe('Hello from Blob!');
        });
    });

    describe('isEncrypted', () => {
        it('should return true for encrypted data', async () => {
            const key = await generateKey();
            const { data: encrypted } = await encrypt(new Uint8Array([1, 2, 3]), key);

            expect(isEncrypted(encrypted)).toBe(true);
        });

        it('should return false for non-encrypted data', () => {
            expect(isEncrypted(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
            expect(isEncrypted(new ArrayBuffer(100))).toBe(false);
        });
    });

    describe('extractSalt', () => {
        it('should return null for randomly keyed encryption', async () => {
            const key = await generateKey();
            const { data: encrypted } = await encrypt(new Uint8Array([1, 2, 3]), key);

            expect(extractSalt(encrypted)).toBe(null);
        });

        it('should return salt for password-derived encryption', async () => {
            const { key, salt } = await deriveKey('test-password');
            const { data: encrypted } = await encrypt(new Uint8Array([1, 2, 3]), key, { salt });

            const extractedSalt = extractSalt(encrypted);
            expect(extractedSalt).not.toBe(null);
            expect(extractedSalt).toEqual(salt);
        });
    });

    describe('getEncryptionInfo', () => {
        it('should return correct info for encrypted data', async () => {
            const key = await generateKey();
            const testData = new Uint8Array(1000);
            const { data: encrypted } = await encrypt(testData, key);

            const info = getEncryptionInfo(encrypted);

            expect(info.isEncrypted).toBe(true);
            expect(info.version).toBe(1);
            expect(info.hasPasswordSalt).toBe(false);
            expect(info.encryptedSize).toBe(encrypted.byteLength);
            // Original size estimation should be close to actual
            expect(info.estimatedOriginalSize).toBeCloseTo(1000, -1);
        });

        it('should return correct info for non-encrypted data', () => {
            const data = new Uint8Array(500);
            const info = getEncryptionInfo(data);

            expect(info.isEncrypted).toBe(false);
            expect(info.hasPasswordSalt).toBe(false);
            expect(info.encryptedSize).toBe(500);
        });
    });
});
