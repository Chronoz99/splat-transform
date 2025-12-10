/**
 * Unit tests for obfuscated crypto utilities
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    splitKeyForDelivery,
    createObfuscatedCrypto,
    generateSessionToken,
    ObfuscatedCrypto
} from '../../src/utils/obfuscated-crypto';
import {
    generateKey,
    exportKey,
    encrypt
} from '../../src/utils/encryption';

describe('Obfuscated Crypto Utilities', () => {
    describe('splitKeyForDelivery', () => {
        it('should split a 32-byte key into 4 fragments', async () => {
            const key = await generateKey();
            const keyString = await exportKey(key);

            const fragments = splitKeyForDelivery(keyString);

            expect(fragments).toHaveLength(4);
            fragments.forEach(fragment => {
                // Each fragment is 8 bytes = ~11 base64 characters
                expect(fragment.length).toBeGreaterThan(0);
                expect(fragment.length).toBeLessThanOrEqual(12);
            });
        });

        it('should accept Uint8Array input', () => {
            const keyBytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                keyBytes[i] = i;
            }

            const fragments = splitKeyForDelivery(keyBytes);

            expect(fragments).toHaveLength(4);
        });

        it('should throw for invalid key length', () => {
            const shortKey = new Uint8Array(16);

            expect(() => splitKeyForDelivery(shortKey)).toThrow('Key must be 32 bytes');
        });
    });

    describe('generateSessionToken', () => {
        it('should generate a random number', () => {
            const token1 = generateSessionToken();
            const token2 = generateSessionToken();

            expect(typeof token1).toBe('number');
            expect(typeof token2).toBe('number');
            // Very unlikely to be equal
            expect(token1).not.toBe(token2);
        });
    });

    describe('ObfuscatedCrypto', () => {
        let key: CryptoKey;
        let keyString: string;
        let fragments: string[];
        let sessionToken: number;
        let testData: Uint8Array;
        let encryptedData: ArrayBuffer;

        beforeEach(async () => {
            // Generate test key and fragments
            key = await generateKey();
            keyString = await exportKey(key);
            fragments = splitKeyForDelivery(keyString);
            sessionToken = generateSessionToken();

            // Create test data and encrypt it
            testData = new TextEncoder().encode('Hello, obfuscated world!');
            const result = await encrypt(testData, key);
            encryptedData = result.data;
        });

        it('should create an instance with session token', () => {
            const crypto = createObfuscatedCrypto(sessionToken);
            expect(crypto).toBeInstanceOf(ObfuscatedCrypto);
        });

        it('should not be ready until all fragments are set', () => {
            const crypto = createObfuscatedCrypto(sessionToken);

            expect(crypto.isReady()).toBe(false);

            crypto.setFragment(0, fragments[0]);
            expect(crypto.isReady()).toBe(false);

            crypto.setFragment(1, fragments[1]);
            expect(crypto.isReady()).toBe(false);

            crypto.setFragment(2, fragments[2]);
            expect(crypto.isReady()).toBe(false);

            crypto.setFragment(3, fragments[3]);
            expect(crypto.isReady()).toBe(true);
        });

        it('should accept fragments in any order', () => {
            const crypto = createObfuscatedCrypto(sessionToken);

            crypto.setFragment(3, fragments[3]);
            crypto.setFragment(1, fragments[1]);
            crypto.setFragment(0, fragments[0]);
            crypto.setFragment(2, fragments[2]);

            expect(crypto.isReady()).toBe(true);
        });

        it('should decrypt data correctly after setting all fragments', async () => {
            const crypto = createObfuscatedCrypto(sessionToken);

            // Set all fragments
            fragments.forEach((fragment, index) => {
                crypto.setFragment(index, fragment);
            });

            // Decrypt
            const decrypted = await crypto.decrypt(encryptedData);
            const decryptedText = new TextDecoder().decode(decrypted);

            expect(decryptedText).toBe('Hello, obfuscated world!');

            crypto.destroy();
        });

        it('should throw if decrypting before all fragments set', async () => {
            const crypto = createObfuscatedCrypto(sessionToken);
            crypto.setFragment(0, fragments[0]);
            crypto.setFragment(1, fragments[1]);

            await expect(crypto.decrypt(encryptedData))
                .rejects.toThrow('Not all key fragments have been set');
        });

        it('should throw for invalid fragment index', () => {
            const crypto = createObfuscatedCrypto(sessionToken);

            expect(() => crypto.setFragment(-1, fragments[0])).toThrow('Fragment index must be 0-3');
            expect(() => crypto.setFragment(4, fragments[0])).toThrow('Fragment index must be 0-3');
        });

        it('should throw for invalid encrypted data', async () => {
            const crypto = createObfuscatedCrypto(sessionToken);
            fragments.forEach((fragment, index) => {
                crypto.setFragment(index, fragment);
            });

            const invalidData = new Uint8Array([1, 2, 3, 4, 5]);

            await expect(crypto.decrypt(invalidData))
                .rejects.toThrow('Invalid encrypted data format');
        });

        it('should clear key material on destroy', () => {
            const crypto = createObfuscatedCrypto(sessionToken);
            fragments.forEach((fragment, index) => {
                crypto.setFragment(index, fragment);
            });

            expect(crypto.isReady()).toBe(true);

            crypto.destroy();

            // After destroy, should not be ready
            expect(crypto.isReady()).toBe(false);
        });

        it('should work with different session tokens generating different masks', async () => {
            // Same fragments but different session tokens should still work
            // because the obfuscation is symmetric (XOR twice = original)
            const crypto1 = createObfuscatedCrypto(sessionToken);
            const crypto2 = createObfuscatedCrypto(sessionToken + 1);

            fragments.forEach((fragment, index) => {
                crypto1.setFragment(index, fragment);
                crypto2.setFragment(index, fragment);
            });

            // Both should decrypt correctly because fragments contain the actual key data
            // (the masks are internal to each session)
            const decrypted1 = await crypto1.decrypt(encryptedData);
            const decrypted2 = await crypto2.decrypt(encryptedData);

            expect(new TextDecoder().decode(decrypted1)).toBe('Hello, obfuscated world!');
            expect(new TextDecoder().decode(decrypted2)).toBe('Hello, obfuscated world!');

            crypto1.destroy();
            crypto2.destroy();
        });
    });
});
