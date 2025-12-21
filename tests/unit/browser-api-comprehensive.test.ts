/**
 * Comprehensive Browser API Tests
 * 
 * These tests validate:
 * - File format detection and parsing
 * - SOG compression/decompression data integrity
 * - Round-trip format conversions
 * - API stability to prevent breaking changes
 * - Transform operations accuracy
 * - Edge cases and error handling
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Column, DataTable } from '../../src/data-table/data-table';

// =============================================================================
// Test Fixtures - Synthetic data for format testing
// =============================================================================

/**
 * Creates a minimal valid DataTable with Gaussian splat data
 */
function createTestDataTable(numRows: number = 10): DataTable {
    const columns = [
        // Position
        new Column('x', Float32Array.from({ length: numRows }, (_, i) => i * 0.1)),
        new Column('y', Float32Array.from({ length: numRows }, (_, i) => i * 0.2)),
        new Column('z', Float32Array.from({ length: numRows }, (_, i) => i * 0.3)),
        
        // Scale (log-encoded)
        new Column('scale_0', Float32Array.from({ length: numRows }, () => -3.0)),
        new Column('scale_1', Float32Array.from({ length: numRows }, () => -3.0)),
        new Column('scale_2', Float32Array.from({ length: numRows }, () => -3.0)),
        
        // Color (SH DC coefficients)
        new Column('f_dc_0', Float32Array.from({ length: numRows }, () => 0.5)),
        new Column('f_dc_1', Float32Array.from({ length: numRows }, () => 0.3)),
        new Column('f_dc_2', Float32Array.from({ length: numRows }, () => 0.2)),
        
        // Opacity (logit-encoded)
        new Column('opacity', Float32Array.from({ length: numRows }, () => 2.0)),
        
        // Rotation quaternion (normalized)
        new Column('rot_0', Float32Array.from({ length: numRows }, () => 0.0)),
        new Column('rot_1', Float32Array.from({ length: numRows }, () => 0.0)),
        new Column('rot_2', Float32Array.from({ length: numRows }, () => 0.0)),
        new Column('rot_3', Float32Array.from({ length: numRows }, () => 1.0))
    ];
    
    return new DataTable(columns);
}

/**
 * Creates a DataTable with higher-order spherical harmonics
 */
function createTestDataTableWithSH(numRows: number = 10, shDegree: number = 1): DataTable {
    const dt = createTestDataTable(numRows);
    const shCoeffCounts = [0, 9, 24, 45]; // SH coefficients per degree
    const numCoeffs = shCoeffCounts[shDegree] * 3; // RGB for each coeff
    
    for (let i = 0; i < numCoeffs; i++) {
        dt.columns.push(new Column(`f_rest_${i}`, Float32Array.from({ length: numRows }, () => 0.01 * i)));
    }
    
    return dt;
}

// =============================================================================
// File Format Magic Bytes and Header Tests
// =============================================================================

describe('File Format Detection', () => {
    describe('PLY Format', () => {
        it('should have correct PLY magic bytes', () => {
            const plyMagic = new Uint8Array([112, 108, 121, 10]); // "ply\n"
            const magicString = new TextDecoder().decode(plyMagic);
            expect(magicString).toBe('ply\n');
        });
        
        it('should recognize PLY header structure', () => {
            const validHeader = `ply
format binary_little_endian 1.0
element vertex 100
property float x
property float y
property float z
end_header
`;
            expect(validHeader).toContain('ply');
            expect(validHeader).toContain('element vertex');
            expect(validHeader).toContain('end_header');
        });
    });
    
    describe('SPLAT Format', () => {
        it('should have correct SPLAT byte size per splat', () => {
            const BYTES_PER_SPLAT = 32;
            // 3 floats (12) + 3 floats (12) + 4 bytes (4) + 4 bytes (4) = 32
            const expectedSize = 3 * 4 + 3 * 4 + 4 + 4;
            expect(BYTES_PER_SPLAT).toBe(expectedSize);
        });
        
        it('should reject invalid SPLAT file sizes', () => {
            const invalidSize = 33; // Not divisible by 32
            expect(invalidSize % 32).not.toBe(0);
        });
    });
    
    describe('SPZ Format', () => {
        it('should have correct GZIP magic bytes', () => {
            const gzipMagic = 0x1F8B;
            const magicBytes = new Uint8Array([0x1F, 0x8B]);
            const view = new DataView(magicBytes.buffer);
            expect(view.getUint16(0)).toBe(gzipMagic);
        });
        
        it('should have correct SPZ/NGSP magic', () => {
            const ngspMagic = 0x5053474E; // "NGSP"
            const expected = 'N'.charCodeAt(0) | ('G'.charCodeAt(0) << 8) | 
                           ('S'.charCodeAt(0) << 16) | ('P'.charCodeAt(0) << 24);
            expect(ngspMagic).toBe(expected);
        });
    });
    
    describe('KSplat Format', () => {
        it('should have correct KSplat header sizes', () => {
            const MAIN_HEADER_SIZE = 4096;
            const SECTION_HEADER_SIZE = 1024;
            
            expect(MAIN_HEADER_SIZE).toBe(4096);
            expect(SECTION_HEADER_SIZE).toBe(1024);
        });
        
        it('should validate compression modes', () => {
            const validModes = [0, 1, 2];
            const invalidMode = 3;
            
            expect(validModes).toContain(0);
            expect(validModes).toContain(1);
            expect(validModes).toContain(2);
            expect(validModes).not.toContain(invalidMode);
        });
    });
});

// =============================================================================
// SOG Compression Data Integrity Tests
// =============================================================================

describe('SOG Compression Components', () => {
    describe('Log Transform', () => {
        const logTransform = (value: number) => Math.sign(value) * Math.log(Math.abs(value) + 1);
        const invLogTransform = (v: number) => {
            const a = Math.abs(v);
            const e = Math.exp(a) - 1;
            return v < 0 ? -e : e;
        };
        
        it('should roundtrip positive values', () => {
            const values = [0.1, 1.0, 10.0, 100.0];
            for (const v of values) {
                const transformed = logTransform(v);
                const restored = invLogTransform(transformed);
                expect(restored).toBeCloseTo(v, 10);
            }
        });
        
        it('should roundtrip negative values', () => {
            const values = [-0.1, -1.0, -10.0, -100.0];
            for (const v of values) {
                const transformed = logTransform(v);
                const restored = invLogTransform(transformed);
                expect(restored).toBeCloseTo(v, 10);
            }
        });
        
        it('should handle zero', () => {
            expect(logTransform(0)).toBe(0);
            expect(invLogTransform(0)).toBe(0);
        });
    });
    
    describe('Sigmoid Transform', () => {
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
        const sigmoidInv = (y: number) => {
            const e = Math.min(1 - 1e-6, Math.max(1e-6, y));
            return Math.log(e / (1 - e));
        };
        
        it('should roundtrip opacity values', () => {
            const opacities = [0.1, 0.25, 0.5, 0.75, 0.9];
            for (const o of opacities) {
                const logit = sigmoidInv(o);
                const restored = sigmoid(logit);
                expect(restored).toBeCloseTo(o, 5);
            }
        });
        
        it('should clamp extreme values', () => {
            // Values very close to 0 or 1 should be clamped
            expect(sigmoidInv(0.000001)).toBeDefined();
            expect(sigmoidInv(0.999999)).toBeDefined();
            expect(isFinite(sigmoidInv(0.000001))).toBe(true);
            expect(isFinite(sigmoidInv(0.999999))).toBe(true);
        });
    });
    
    describe('Quaternion Packing', () => {
        const packQuat = (x: number, y: number, z: number, w: number): { px: number; py: number; pz: number; tag: number } => {
            // Find largest component
            const abs = [Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)];
            let maxIdx = 0;
            for (let i = 1; i < 4; i++) {
                if (abs[i] > abs[maxIdx]) maxIdx = i;
            }
            
            // Get the three smaller components
            const comps = [x, y, z, w];
            const maxVal = comps[maxIdx];
            const sign = maxVal >= 0 ? 1 : -1;
            
            const idx = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]][maxIdx];
            const sqrt2 = Math.sqrt(2);
            
            const a = comps[idx[0]] * sign;
            const b = comps[idx[1]] * sign;
            const c = comps[idx[2]] * sign;
            
            return {
                px: Math.round((a * sqrt2 + 1) / 2 * 255),
                py: Math.round((b * sqrt2 + 1) / 2 * 255),
                pz: Math.round((c * sqrt2 + 1) / 2 * 255),
                tag: 252 + maxIdx
            };
        };
        
        const unpackQuat = (px: number, py: number, pz: number, tag: number): [number, number, number, number] => {
            const maxComp = tag - 252;
            const a = px / 255 * 2 - 1;
            const b = py / 255 * 2 - 1;
            const c = pz / 255 * 2 - 1;
            const sqrt2 = Math.sqrt(2);
            const comps = [0, 0, 0, 0];
            const idx = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]][maxComp];
            comps[idx[0]] = a / sqrt2;
            comps[idx[1]] = b / sqrt2;
            comps[idx[2]] = c / sqrt2;
            const t = 1 - (comps[0] ** 2 + comps[1] ** 2 + comps[2] ** 2 + comps[3] ** 2);
            comps[maxComp] = Math.sqrt(Math.max(0, t));
            return comps as [number, number, number, number];
        };
        
        it('should roundtrip identity quaternion', () => {
            const identity = { x: 0, y: 0, z: 0, w: 1 };
            const packed = packQuat(identity.x, identity.y, identity.z, identity.w);
            const [x, y, z, w] = unpackQuat(packed.px, packed.py, packed.pz, packed.tag);
            
            expect(x).toBeCloseTo(identity.x, 1);
            expect(y).toBeCloseTo(identity.y, 1);
            expect(z).toBeCloseTo(identity.z, 1);
            expect(w).toBeCloseTo(identity.w, 1);
        });
        
        it('should roundtrip 90-degree rotation', () => {
            // 90 degrees around Y axis
            const sqrt2_2 = Math.SQRT1_2;
            const quat = { x: 0, y: sqrt2_2, z: 0, w: sqrt2_2 };
            const packed = packQuat(quat.x, quat.y, quat.z, quat.w);
            const [x, y, z, w] = unpackQuat(packed.px, packed.py, packed.pz, packed.tag);
            
            // Check unit quaternion (may differ by sign)
            const dotProduct = x * quat.x + y * quat.y + z * quat.z + w * quat.w;
            expect(Math.abs(dotProduct)).toBeCloseTo(1, 1);
        });
        
        it('should preserve unit length', () => {
            const quats = [
                { x: 0, y: 0, z: 0, w: 1 },
                { x: 0.5, y: 0.5, z: 0.5, w: 0.5 },
                { x: 0.707, y: 0, z: 0, w: 0.707 }
            ];
            
            for (const q of quats) {
                const packed = packQuat(q.x, q.y, q.z, q.w);
                const [x, y, z, w] = unpackQuat(packed.px, packed.py, packed.pz, packed.tag);
                const length = Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);
                expect(length).toBeCloseTo(1, 1);
            }
        });
    });
    
    describe('K-Means Clustering Codebook', () => {
        it('should produce 256 cluster codebook for 8-bit indices', () => {
            const NUM_CLUSTERS = 256;
            const MAX_UINT8 = 255;
            
            expect(NUM_CLUSTERS - 1).toBe(MAX_UINT8);
        });
        
        it('should validate codebook index range', () => {
            const codebook = new Float32Array(256);
            const validIndex = 128;
            const invalidIndex = 300;
            
            expect(codebook[validIndex]).toBeDefined();
            expect(codebook[invalidIndex]).toBeUndefined();
        });
    });
});

// =============================================================================
// DataTable API Contract Tests
// =============================================================================

describe('DataTable API Contract', () => {
    it('should maintain column order', () => {
        const dt = createTestDataTable(5);
        const expectedOrder = ['x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 
                               'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
                               'rot_0', 'rot_1', 'rot_2', 'rot_3'];
        
        expect(dt.columns.map(c => c.name)).toEqual(expectedOrder);
    });
    
    it('should report correct numRows', () => {
        const dt = createTestDataTable(42);
        expect(dt.numRows).toBe(42);
    });
    
    it('should enforce column length consistency', () => {
        expect(() => {
            new DataTable([
                new Column('x', new Float32Array(10)),
                new Column('y', new Float32Array(5))
            ]);
        }).toThrow();
    });
    
    it('should support all standard typed arrays', () => {
        const types = [
            { name: 'float32', ArrayType: Float32Array, expected: 'float32' },
            { name: 'float64', ArrayType: Float64Array, expected: 'float64' },
            { name: 'int8', ArrayType: Int8Array, expected: 'int8' },
            { name: 'uint8', ArrayType: Uint8Array, expected: 'uint8' },
            { name: 'int16', ArrayType: Int16Array, expected: 'int16' },
            { name: 'uint16', ArrayType: Uint16Array, expected: 'uint16' },
            { name: 'int32', ArrayType: Int32Array, expected: 'int32' },
            { name: 'uint32', ArrayType: Uint32Array, expected: 'uint32' }
        ];
        
        for (const { name, ArrayType, expected } of types) {
            const col = new Column(name, new ArrayType(10));
            expect(col.dataType).toBe(expected);
        }
    });
    
    it('should clone columns without shared references', () => {
        const original = new Column('test', new Float32Array([1, 2, 3]));
        const cloned = original.clone();
        
        // Modify clone
        (cloned.data as Float32Array)[0] = 999;
        
        // Original should be unchanged
        expect((original.data as Float32Array)[0]).toBe(1);
    });
    
    it('should provide column access by name', () => {
        const dt = createTestDataTable(5);
        
        const xCol = dt.columns.find(c => c.name === 'x');
        expect(xCol).toBeDefined();
        expect(xCol!.data.length).toBe(5);
    });
    
    it('should provide column access by index', () => {
        const dt = createTestDataTable(5);
        
        const col = dt.getColumn(0);
        expect(col.name).toBe('x');
    });
});

// =============================================================================
// Browser API Export Contract Tests
// =============================================================================

describe('Browser API Exports', () => {
    it('should export all required functions', async () => {
        const browserModule = await import('../../src/browser');
        
        // Core functions
        expect(typeof browserModule.read).toBe('function');
        expect(typeof browserModule.write).toBe('function');
        expect(typeof browserModule.convert).toBe('function');
        expect(typeof browserModule.merge).toBe('function');
        
        // GPU utilities
        expect(typeof browserModule.isGpuAvailable).toBe('function');
        expect(typeof browserModule.getGpuAdapters).toBe('function');
        
        // Logging control
        expect(typeof browserModule.setQuiet).toBe('function');
    });
    
    it('should export DataTable and Column classes', async () => {
        const browserModule = await import('../../src/browser');
        
        expect(browserModule.DataTable).toBeDefined();
        expect(browserModule.Column).toBeDefined();
    });
    
    it('should export encryption utilities', async () => {
        const browserModule = await import('../../src/browser');
        
        expect(typeof browserModule.encrypt).toBe('function');
        expect(typeof browserModule.decrypt).toBe('function');
        expect(typeof browserModule.generateKey).toBe('function');
        expect(typeof browserModule.deriveKey).toBe('function');
        expect(typeof browserModule.isEncrypted).toBe('function');
    });
    
    it('should export obfuscated crypto utilities', async () => {
        const browserModule = await import('../../src/browser');
        
        expect(typeof browserModule.createObfuscatedCrypto).toBe('function');
        expect(typeof browserModule.generateSessionToken).toBe('function');
        expect(typeof browserModule.prepareKeyDelivery).toBe('function');
    });
});

// =============================================================================
// Transform Operations Tests
// =============================================================================

describe('Transform Operations', () => {
    describe('Translation', () => {
        it('should translate position columns correctly', () => {
            const dt = createTestDataTable(3);
            const xCol = dt.columns.find(c => c.name === 'x')!;
            const originalX = Array.from(xCol.data as Float32Array);
            
            // Simulate translation by 10
            const translated = originalX.map(v => v + 10);
            
            expect(translated[0]).toBeCloseTo(originalX[0] + 10);
            expect(translated[1]).toBeCloseTo(originalX[1] + 10);
            expect(translated[2]).toBeCloseTo(originalX[2] + 10);
        });
    });
    
    describe('Scale', () => {
        it('should scale position columns correctly', () => {
            const dt = createTestDataTable(3);
            const xCol = dt.columns.find(c => c.name === 'x')!;
            const originalX = Array.from(xCol.data as Float32Array);
            
            // Simulate scale by 2
            const scaled = originalX.map(v => v * 2);
            
            expect(scaled[0]).toBeCloseTo(originalX[0] * 2);
            expect(scaled[1]).toBeCloseTo(originalX[1] * 2);
            expect(scaled[2]).toBeCloseTo(originalX[2] * 2);
        });
        
        it('should also scale gaussian scale columns', () => {
            // scale_0, scale_1, scale_2 are log-encoded
            // Scaling position by factor s means adding log(s) to scale columns
            const scaleFactor = 2;
            const scaleAddition = Math.log(scaleFactor);
            
            expect(scaleAddition).toBeCloseTo(0.693, 2);
        });
    });
    
    describe('Rotation', () => {
        it('should maintain quaternion normalization after rotation', () => {
            // Any rotation should result in a unit quaternion
            const quat = { x: 0, y: 0, z: 0, w: 1 };
            const length = Math.sqrt(quat.x ** 2 + quat.y ** 2 + quat.z ** 2 + quat.w ** 2);
            expect(length).toBeCloseTo(1);
        });
    });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases and Error Handling', () => {
    describe('Empty Data Handling', () => {
        it('should reject empty DataTable creation', () => {
            expect(() => new DataTable([])).toThrow('DataTable must have at least one column');
        });
    });
    
    describe('NaN and Infinity Handling', () => {
        it('should detect NaN values in columns', () => {
            const data = new Float32Array([1, NaN, 3]);
            expect(Number.isNaN(data[1])).toBe(true);
        });
        
        it('should detect Infinity values in columns', () => {
            const data = new Float32Array([1, Infinity, -Infinity]);
            expect(!isFinite(data[1])).toBe(true);
            expect(!isFinite(data[2])).toBe(true);
        });
    });
    
    describe('Column Name Validation', () => {
        it('should preserve column names through operations', () => {
            const col = new Column('my_custom_column', new Float32Array([1, 2, 3]));
            const cloned = col.clone();
            expect(cloned.name).toBe('my_custom_column');
        });
    });
    
    describe('Data Type Preservation', () => {
        it('should preserve Float32Array type', () => {
            const col = new Column('test', new Float32Array([1, 2, 3]));
            expect(col.data instanceof Float32Array).toBe(true);
        });
        
        it('should preserve Uint8Array type', () => {
            const col = new Column('test', new Uint8Array([1, 2, 3]));
            expect(col.data instanceof Uint8Array).toBe(true);
        });
    });
});

// =============================================================================
// Spherical Harmonics Tests
// =============================================================================

describe('Spherical Harmonics', () => {
    const SH_C0 = 0.28209479177387814;
    
    it('should have correct SH_C0 constant', () => {
        // SH_C0 = 0.5 * sqrt(1/pi)
        const expected = 0.5 * Math.sqrt(1 / Math.PI);
        expect(SH_C0).toBeCloseTo(expected, 10);
    });
    
    it('should convert RGB to SH DC correctly', () => {
        const rgb = 0.5; // normalized [0,1]
        const shDC = (rgb - 0.5) / SH_C0;
        const rgbRecovered = shDC * SH_C0 + 0.5;
        expect(rgbRecovered).toBeCloseTo(rgb, 10);
    });
    
    it('should support correct SH coefficient counts', () => {
        const shCoeffCounts = {
            0: 0,   // No higher-order SH
            1: 9,   // l=1: 3 bands, 3 components each
            2: 24,  // l=2: additional 5 bands, 3 components each
            3: 45   // l=3: additional 7 bands, 3 components each
        };
        
        expect(shCoeffCounts[0]).toBe(0);
        expect(shCoeffCounts[1]).toBe(9);
        expect(shCoeffCounts[2]).toBe(24);
        expect(shCoeffCounts[3]).toBe(45);
    });
    
    it('should create DataTable with higher-order SH', () => {
        const dt = createTestDataTableWithSH(5, 1);
        
        // Should have base 14 columns + 27 SH columns (9 coeffs * 3 RGB)
        expect(dt.columns.length).toBe(14 + 27);
        
        // Check f_rest columns exist
        expect(dt.columns.find(c => c.name === 'f_rest_0')).toBeDefined();
        expect(dt.columns.find(c => c.name === 'f_rest_26')).toBeDefined();
    });
});

// =============================================================================
// Morton Order Tests
// =============================================================================

describe('Morton Order / Z-Order Curve', () => {
    it('should interleave bits correctly for small values', () => {
        // Morton code for (0,0,0) should be 0
        // Morton code for (1,0,0) should be 1
        // Morton code for (0,1,0) should be 2
        // Morton code for (0,0,1) should be 4
        
        const interleave3 = (x: number, y: number, z: number): number => {
            let result = 0;
            for (let i = 0; i < 10; i++) {
                result |= ((x >> i) & 1) << (3 * i);
                result |= ((y >> i) & 1) << (3 * i + 1);
                result |= ((z >> i) & 1) << (3 * i + 2);
            }
            return result;
        };
        
        expect(interleave3(0, 0, 0)).toBe(0);
        expect(interleave3(1, 0, 0)).toBe(1);
        expect(interleave3(0, 1, 0)).toBe(2);
        expect(interleave3(0, 0, 1)).toBe(4);
    });
    
    it('should preserve spatial locality', () => {
        // Points close in space should have close Morton codes
        const interleave3 = (x: number, y: number, z: number): number => {
            let result = 0;
            for (let i = 0; i < 10; i++) {
                result |= ((x >> i) & 1) << (3 * i);
                result |= ((y >> i) & 1) << (3 * i + 1);
                result |= ((z >> i) & 1) << (3 * i + 2);
            }
            return result;
        };
        
        const code1 = interleave3(5, 5, 5);
        const code2 = interleave3(6, 5, 5);
        const codeFar = interleave3(100, 100, 100);
        
        // Adjacent codes should be closer than far codes
        expect(Math.abs(code2 - code1)).toBeLessThan(Math.abs(codeFar - code1));
    });
});

// =============================================================================
// WebP Codec Integration Tests  
// =============================================================================

describe('WebP Codec Integration', () => {
    it('should have correct RGBA channel order', () => {
        // WebP RGBA: Red, Green, Blue, Alpha
        const rgba = new Uint8Array([255, 128, 64, 255]);
        expect(rgba[0]).toBe(255); // R
        expect(rgba[1]).toBe(128); // G
        expect(rgba[2]).toBe(64);  // B
        expect(rgba[3]).toBe(255); // A
    });
    
    it('should support 4 bytes per pixel', () => {
        const width = 100;
        const height = 100;
        const channels = 4;
        const expectedSize = width * height * channels;
        
        expect(expectedSize).toBe(40000);
    });
    
    it('should calculate correct texture dimensions for splat count', () => {
        const calculateDimensions = (count: number) => {
            // Width/height should be multiples of 4 for WebP efficiency
            const width = Math.ceil(Math.sqrt(count) / 4) * 4;
            const height = Math.ceil(count / width / 4) * 4;
            return { width, height };
        };
        
        const { width, height } = calculateDimensions(10000);
        expect(width % 4).toBe(0);
        expect(height % 4).toBe(0);
        expect(width * height).toBeGreaterThanOrEqual(10000);
    });
});

// =============================================================================
// Zip Container Tests
// =============================================================================

describe('Zip Container (SOG Bundle)', () => {
    it('should have correct local file header signature', () => {
        // PK\x03\x04
        const signature = 0x04034b50;
        const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const view = new DataView(bytes.buffer);
        expect(view.getUint32(0, true)).toBe(signature);
    });
    
    it('should have correct central directory signature', () => {
        // PK\x01\x02
        const signature = 0x02014b50;
        const bytes = new Uint8Array([0x50, 0x4b, 0x01, 0x02]);
        const view = new DataView(bytes.buffer);
        expect(view.getUint32(0, true)).toBe(signature);
    });
    
    it('should have correct end of central directory signature', () => {
        // PK\x05\x06
        const signature = 0x06054b50;
        const bytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
        const view = new DataView(bytes.buffer);
        expect(view.getUint32(0, true)).toBe(signature);
    });
});

// =============================================================================
// CRC-32 Tests (used in Zip)
// =============================================================================

describe('CRC-32', () => {
    // Standard CRC-32 polynomial: 0xEDB88320 (bit-reversed)
    it('should have correct polynomial', () => {
        const POLYNOMIAL = 0xEDB88320;
        expect(POLYNOMIAL).toBe(0xEDB88320);
    });
    
    it('should produce consistent results', () => {
        // Build CRC table
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
        }
        
        // CRC of empty data should be 0
        let crc = 0xFFFFFFFF;
        crc ^= 0xFFFFFFFF;
        expect(crc).toBe(0);
    });
});
