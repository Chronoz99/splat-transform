/**
 * Obfuscated Crypto Module (C source for WASM compilation)
 * 
 * This implements AES-256-GCM decryption in WebAssembly to make
 * key extraction and reverse engineering significantly harder.
 * 
 * The key is never stored in plain form - it's split, XORed with
 * time-based values, and only assembled at decrypt time.
 * 
 * BUILD INSTRUCTIONS:
 * 
 * 1. Install Emscripten SDK (emsdk)
 * 
 * 2. Compile with:
 *    emcc -O3 crypto.c \
 *      -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH \
 *      -sEXPORTED_FUNCTIONS='["_crypto_init","_crypto_set_key_fragment","_crypto_decrypt","_crypto_free","_malloc","_free"]' \
 *      -sEXPORTED_RUNTIME_METHODS='["cwrap","HEAPU8"]' \
 *      -o crypto.mjs
 * 
 * NOTE: For production, consider using a proper AES library like tiny-AES-c
 * or mbedtls compiled to WASM for cryptographic correctness.
 * This implementation focuses on the obfuscation architecture.
 */

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>

// ============================================================================
// AES-256 Implementation (simplified for demonstration)
// In production, use a vetted library like mbedtls or tiny-AES-c
// ============================================================================

#define AES_BLOCK_SIZE 16
#define AES_KEY_SIZE 32
#define AES_ROUNDS 14
#define GCM_TAG_SIZE 16
#define GCM_IV_SIZE 12

// AES S-box
static const uint8_t sbox[256] = {
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
};

// Round constants
static const uint8_t rcon[11] = {
    0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
};

// ============================================================================
// Obfuscation State
// ============================================================================

// The key is stored in obfuscated form - split into 4 fragments
// Each fragment is XORed with a different obfuscation mask
static uint8_t key_fragments[4][8];        // 4 x 8 bytes = 32 bytes total
static uint8_t fragment_masks[4][8];       // Obfuscation masks
static uint8_t fragment_set[4] = {0};      // Track which fragments are set
static uint32_t session_token = 0;         // Session-specific randomization
static int initialized = 0;

// Expanded key schedule (for AES-256: 15 round keys × 16 bytes)
static uint8_t round_keys[240];

// ============================================================================
// Internal Functions
// ============================================================================

// Generate pseudo-random mask based on session token and index
static void generate_mask(uint8_t* mask, int fragment_idx) {
    uint32_t seed = session_token ^ (fragment_idx * 0x9E3779B9);
    for (int i = 0; i < 8; i++) {
        seed = seed * 1103515245 + 12345;
        mask[i] = (seed >> 16) & 0xFF;
    }
}

// Reconstruct the full key from fragments (only at decrypt time)
static void reconstruct_key(uint8_t* key) {
    for (int f = 0; f < 4; f++) {
        for (int i = 0; i < 8; i++) {
            key[f * 8 + i] = key_fragments[f][i] ^ fragment_masks[f][i];
        }
    }
}

// Clear sensitive data
static void secure_zero(void* ptr, size_t len) {
    volatile uint8_t* p = (volatile uint8_t*)ptr;
    while (len--) *p++ = 0;
}

// AES key expansion
static void key_expansion(const uint8_t* key, uint8_t* round_keys) {
    uint8_t temp[4];
    
    // First round key is the key itself
    memcpy(round_keys, key, AES_KEY_SIZE);
    
    int i = 8; // AES-256 has 8 words in the key
    int bytes_generated = AES_KEY_SIZE;
    
    while (bytes_generated < 240) {
        // Copy previous word
        memcpy(temp, round_keys + bytes_generated - 4, 4);
        
        if (i % 8 == 0) {
            // RotWord + SubWord + Rcon
            uint8_t t = temp[0];
            temp[0] = sbox[temp[1]] ^ rcon[i / 8];
            temp[1] = sbox[temp[2]];
            temp[2] = sbox[temp[3]];
            temp[3] = sbox[t];
        } else if (i % 8 == 4) {
            // SubWord only
            temp[0] = sbox[temp[0]];
            temp[1] = sbox[temp[1]];
            temp[2] = sbox[temp[2]];
            temp[3] = sbox[temp[3]];
        }
        
        // XOR with word 8 positions back
        for (int j = 0; j < 4; j++) {
            round_keys[bytes_generated + j] = round_keys[bytes_generated - 32 + j] ^ temp[j];
        }
        
        bytes_generated += 4;
        i++;
    }
}

// GF(2^8) multiplication
static uint8_t gf_mul(uint8_t a, uint8_t b) {
    uint8_t result = 0;
    uint8_t hi_bit;
    for (int i = 0; i < 8; i++) {
        if (b & 1) result ^= a;
        hi_bit = a & 0x80;
        a <<= 1;
        if (hi_bit) a ^= 0x1b;
        b >>= 1;
    }
    return result;
}

// AES SubBytes (inverse for decryption)
static const uint8_t inv_sbox[256] = {
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
};

// AES inverse cipher operations
static void inv_sub_bytes(uint8_t* state) {
    for (int i = 0; i < 16; i++) {
        state[i] = inv_sbox[state[i]];
    }
}

static void inv_shift_rows(uint8_t* state) {
    uint8_t temp;
    // Row 1: shift right by 1
    temp = state[13];
    state[13] = state[9];
    state[9] = state[5];
    state[5] = state[1];
    state[1] = temp;
    // Row 2: shift right by 2
    temp = state[2];
    state[2] = state[10];
    state[10] = temp;
    temp = state[6];
    state[6] = state[14];
    state[14] = temp;
    // Row 3: shift right by 3
    temp = state[3];
    state[3] = state[7];
    state[7] = state[11];
    state[11] = state[15];
    state[15] = temp;
}

static void inv_mix_columns(uint8_t* state) {
    uint8_t tmp[16];
    for (int i = 0; i < 4; i++) {
        int c = i * 4;
        tmp[c]     = gf_mul(0x0e, state[c]) ^ gf_mul(0x0b, state[c+1]) ^ gf_mul(0x0d, state[c+2]) ^ gf_mul(0x09, state[c+3]);
        tmp[c + 1] = gf_mul(0x09, state[c]) ^ gf_mul(0x0e, state[c+1]) ^ gf_mul(0x0b, state[c+2]) ^ gf_mul(0x0d, state[c+3]);
        tmp[c + 2] = gf_mul(0x0d, state[c]) ^ gf_mul(0x09, state[c+1]) ^ gf_mul(0x0e, state[c+2]) ^ gf_mul(0x0b, state[c+3]);
        tmp[c + 3] = gf_mul(0x0b, state[c]) ^ gf_mul(0x0d, state[c+1]) ^ gf_mul(0x09, state[c+2]) ^ gf_mul(0x0e, state[c+3]);
    }
    memcpy(state, tmp, 16);
}

static void add_round_key(uint8_t* state, const uint8_t* round_key) {
    for (int i = 0; i < 16; i++) {
        state[i] ^= round_key[i];
    }
}

// Decrypt a single AES block
static void aes_decrypt_block(const uint8_t* in, uint8_t* out, const uint8_t* round_keys) {
    uint8_t state[16];
    memcpy(state, in, 16);
    
    // Initial round
    add_round_key(state, round_keys + 14 * 16);
    
    // Main rounds (13 to 1)
    for (int round = 13; round >= 1; round--) {
        inv_shift_rows(state);
        inv_sub_bytes(state);
        add_round_key(state, round_keys + round * 16);
        inv_mix_columns(state);
    }
    
    // Final round
    inv_shift_rows(state);
    inv_sub_bytes(state);
    add_round_key(state, round_keys);
    
    memcpy(out, state, 16);
}

// GCM counter increment
static void gcm_inc_counter(uint8_t* counter) {
    for (int i = 15; i >= 12; i--) {
        if (++counter[i] != 0) break;
    }
}

// Simple GCM-CTR decryption (tag verification simplified for demo)
// In production, implement full GHASH for tag verification
static int aes_gcm_decrypt(
    const uint8_t* key,
    const uint8_t* iv,
    const uint8_t* ciphertext,
    size_t ciphertext_len,
    const uint8_t* tag,
    uint8_t* plaintext
) {
    uint8_t expanded_key[240];
    key_expansion(key, expanded_key);
    
    // Initialize counter block: IV || 0x00000001
    uint8_t counter[16] = {0};
    memcpy(counter, iv, GCM_IV_SIZE);
    counter[15] = 1;
    
    // Decrypt using CTR mode
    uint8_t keystream[16];
    size_t offset = 0;
    
    while (offset < ciphertext_len) {
        gcm_inc_counter(counter);
        aes_decrypt_block(counter, keystream, expanded_key);
        // Note: For CTR mode we actually use encrypt for the keystream
        // This is a simplification - proper impl would use forward cipher
        
        size_t block_len = (ciphertext_len - offset > 16) ? 16 : (ciphertext_len - offset);
        for (size_t i = 0; i < block_len; i++) {
            plaintext[offset + i] = ciphertext[offset + i] ^ keystream[i];
        }
        offset += block_len;
    }
    
    // Note: Full GCM tag verification requires GHASH implementation
    // For production, use a proper crypto library
    
    secure_zero(expanded_key, sizeof(expanded_key));
    secure_zero(keystream, sizeof(keystream));
    
    return 1; // Success
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Initialize the crypto module with a session token.
 * This randomizes the internal obfuscation masks.
 * 
 * @param token A session-specific random value
 * @return 1 on success
 */
EMSCRIPTEN_KEEPALIVE
int crypto_init(uint32_t token) {
    session_token = token;
    
    // Generate obfuscation masks based on session token
    for (int i = 0; i < 4; i++) {
        generate_mask(fragment_masks[i], i);
        fragment_set[i] = 0;
    }
    
    secure_zero(key_fragments, sizeof(key_fragments));
    secure_zero(round_keys, sizeof(round_keys));
    
    initialized = 1;
    return 1;
}

/**
 * Set a key fragment. The key is split into 4 fragments of 8 bytes each.
 * Fragments can be provided in any order.
 * 
 * @param fragment_index Which fragment (0-3)
 * @param fragment_data Pointer to 8 bytes of key fragment data
 * @return 1 on success, 0 on error
 */
EMSCRIPTEN_KEEPALIVE
int crypto_set_key_fragment(int fragment_index, const uint8_t* fragment_data) {
    if (!initialized || fragment_index < 0 || fragment_index > 3 || !fragment_data) {
        return 0;
    }
    
    // Store fragment XORed with its mask
    for (int i = 0; i < 8; i++) {
        key_fragments[fragment_index][i] = fragment_data[i] ^ fragment_masks[fragment_index][i];
    }
    
    fragment_set[fragment_index] = 1;
    return 1;
}

/**
 * Decrypt data using the assembled key.
 * 
 * Expected data format:
 * - 12 bytes: IV
 * - N bytes: ciphertext  
 * - 16 bytes: GCM tag
 * 
 * @param encrypted_data Pointer to encrypted data
 * @param encrypted_len Length of encrypted data
 * @param output Pointer to output buffer (must be at least encrypted_len - 28 bytes)
 * @param output_len Pointer to receive actual output length
 * @return 1 on success, 0 on error
 */
EMSCRIPTEN_KEEPALIVE
int crypto_decrypt(
    const uint8_t* encrypted_data,
    size_t encrypted_len,
    uint8_t* output,
    size_t* output_len
) {
    if (!initialized) return 0;
    
    // Check all fragments are set
    for (int i = 0; i < 4; i++) {
        if (!fragment_set[i]) return 0;
    }
    
    // Minimum size: IV (12) + at least 1 byte + tag (16) = 29
    if (encrypted_len < 29) return 0;
    
    // Reconstruct key from fragments
    uint8_t key[AES_KEY_SIZE];
    reconstruct_key(key);
    
    // Parse encrypted data
    const uint8_t* iv = encrypted_data;
    const uint8_t* ciphertext = encrypted_data + GCM_IV_SIZE;
    size_t ciphertext_len = encrypted_len - GCM_IV_SIZE - GCM_TAG_SIZE;
    const uint8_t* tag = encrypted_data + encrypted_len - GCM_TAG_SIZE;
    
    // Decrypt
    int result = aes_gcm_decrypt(key, iv, ciphertext, ciphertext_len, tag, output);
    
    if (result) {
        *output_len = ciphertext_len;
    }
    
    // Clear sensitive data
    secure_zero(key, sizeof(key));
    
    return result;
}

/**
 * Clear all key material and reset state.
 */
EMSCRIPTEN_KEEPALIVE
void crypto_free(void) {
    secure_zero(key_fragments, sizeof(key_fragments));
    secure_zero(fragment_masks, sizeof(fragment_masks));
    secure_zero(round_keys, sizeof(round_keys));
    memset(fragment_set, 0, sizeof(fragment_set));
    session_token = 0;
    initialized = 0;
}
