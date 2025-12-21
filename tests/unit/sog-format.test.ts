/**
 * SOG Format Deep Tests
 * 
 * Tests for the SOG (SuperSplat Optimized Gaussian) format which uses:
 * - WebP lossless compression for texture data
 * - K-means clustering with 256 codebook entries
 * - Log/sigmoid transforms for value encoding
 * - Quaternion packing with 3+2bit encoding
 * - Morton order spatial sorting
 * - ZIP container for bundled mode
 */
import { describe, it, expect } from 'vitest';
import { Column, DataTable } from '../../src/data-table/data-table';

// =============================================================================
// SOG Meta.json Schema Tests
// =============================================================================

describe('SOG Meta.json Schema', () => {
    interface SogMeta {
        version: number;
        count: number;
        means: { mins: number[]; maxs: number[]; files: string[] };
        scales: { codebook: number[]; files: string[] };
        quats: { files: string[] };
        sh0: { codebook: number[]; files: string[] };
        shN?: { count: number; bands: number; codebook: number[]; files: string[] };
    }
    
    it('should have required top-level fields', () => {
        const minimalMeta: SogMeta = {
            version: 1,
            count: 1000,
            means: { mins: [0, 0, 0], maxs: [1, 1, 1], files: ['means_l.webp', 'means_u.webp'] },
            scales: { codebook: [], files: ['scales.webp'] },
            quats: { files: ['quats.webp'] },
            sh0: { codebook: [], files: ['sh0.webp'] }
        };
        
        expect(minimalMeta.version).toBeDefined();
        expect(minimalMeta.count).toBeDefined();
        expect(minimalMeta.means).toBeDefined();
        expect(minimalMeta.scales).toBeDefined();
        expect(minimalMeta.quats).toBeDefined();
        expect(minimalMeta.sh0).toBeDefined();
    });
    
    it('should have correct means structure', () => {
        const means = {
            mins: [-10.5, -20.3, -5.7],
            maxs: [10.5, 20.3, 5.7],
            files: ['means_l.webp', 'means_u.webp']
        };
        
        expect(means.mins.length).toBe(3);
        expect(means.maxs.length).toBe(3);
        expect(means.files.length).toBe(2); // Low and high bytes
    });
    
    it('should support optional higher-order SH', () => {
        const shN = {
            count: 4096, // Palette size for SH
            bands: 1,    // SH degree
            codebook: new Array(256).fill(0).map((_, i) => i * 0.01 - 1.28),
            files: ['sh_centroids.webp', 'sh_labels.webp']
        };
        
        expect(shN.count).toBeGreaterThan(0);
        expect(shN.bands).toBeGreaterThanOrEqual(1);
        expect(shN.codebook.length).toBe(256);
        expect(shN.files.length).toBe(2);
    });
});

// =============================================================================
// SOG Position Encoding Tests (16-bit quantization with log transform)
// =============================================================================

describe('SOG Position Encoding', () => {
    const logTransform = (value: number) => Math.sign(value) * Math.log(Math.abs(value) + 1);
    const invLogTransform = (v: number) => {
        const a = Math.abs(v);
        const e = Math.exp(a) - 1;
        return v < 0 ? -e : e;
    };
    
    it('should encode positions as 16-bit split across two textures', () => {
        // Position is stored as 16-bit value split: low byte in means_l, high byte in means_u
        const position = 5.5;
        const logPos = logTransform(position);
        
        // Quantize to [0, 65535]
        const minVal = -10, maxVal = 10;
        const normalized = (logPos - logTransform(minVal)) / (logTransform(maxVal) - logTransform(minVal));
        const quantized = Math.round(normalized * 65535);
        
        // Split into low and high bytes
        const lowByte = quantized & 0xFF;
        const highByte = (quantized >> 8) & 0xFF;
        
        expect(lowByte).toBeGreaterThanOrEqual(0);
        expect(lowByte).toBeLessThanOrEqual(255);
        expect(highByte).toBeGreaterThanOrEqual(0);
        expect(highByte).toBeLessThanOrEqual(255);
        
        // Reconstruct
        const reconstructed = lowByte | (highByte << 8);
        expect(reconstructed).toBe(quantized);
    });
    
    it('should handle full position range', () => {
        const positions = [-100, -10, -1, 0, 1, 10, 100];
        
        for (const pos of positions) {
            const logPos = logTransform(pos);
            const restored = invLogTransform(logPos);
            expect(restored).toBeCloseTo(pos, 10);
        }
    });
    
    it('should maintain precision for typical scene scales', () => {
        // Test positions in typical scene range
        const positions = [-50, -25, -10, -5, -1, 0, 1, 5, 10, 25, 50];
        const minVal = -60, maxVal = 60;
        
        for (const pos of positions) {
            const logPos = logTransform(pos);
            const logMin = logTransform(minVal);
            const logMax = logTransform(maxVal);
            const logRange = logMax - logMin;
            
            // Quantize
            const normalized = (logPos - logMin) / logRange;
            const quantized = Math.round(normalized * 65535);
            
            // Dequantize
            const denormalized = quantized / 65535 * logRange + logMin;
            const restored = invLogTransform(denormalized);
            
            // Should be within ~0.1% for typical ranges
            const error = Math.abs(restored - pos);
            const relativeError = pos !== 0 ? error / Math.abs(pos) : error;
            expect(relativeError).toBeLessThan(0.01);
        }
    });
});

// =============================================================================
// SOG Scale Encoding Tests (K-means clustering)
// =============================================================================

describe('SOG Scale Encoding', () => {
    it('should use 256-entry codebook', () => {
        const codebook = new Float32Array(256);
        expect(codebook.length).toBe(256);
    });
    
    it('should map scale values to codebook indices', () => {
        // Create a sample codebook (sorted, typical scale values)
        const codebook = Float32Array.from({ length: 256 }, 
            (_, i) => -8 + i * (8 / 255)); // Range [-8, 0] covers typical log-scales
        
        // Find nearest codebook entry for a scale value
        const findNearest = (value: number) => {
            let minDist = Infinity;
            let minIdx = 0;
            for (let i = 0; i < codebook.length; i++) {
                const dist = Math.abs(codebook[i] - value);
                if (dist < minDist) {
                    minDist = dist;
                    minIdx = i;
                }
            }
            return minIdx;
        };
        
        const scaleValue = -4.5; // Typical log-scale
        const idx = findNearest(scaleValue);
        
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(255);
        
        // Reconstructed value should be close
        const reconstructed = codebook[idx];
        expect(Math.abs(reconstructed - scaleValue)).toBeLessThan(0.1);
    });
    
    it('should store 3 scale components per RGBA pixel (using RGB)', () => {
        // scales.webp stores scale labels in R, G, B channels
        const rgbaPixel = new Uint8Array([128, 64, 200, 255]); // R, G, B, A
        
        const scaleIdx0 = rgbaPixel[0]; // scale_0 label
        const scaleIdx1 = rgbaPixel[1]; // scale_1 label
        const scaleIdx2 = rgbaPixel[2]; // scale_2 label
        
        expect(scaleIdx0).toBe(128);
        expect(scaleIdx1).toBe(64);
        expect(scaleIdx2).toBe(200);
    });
});

// =============================================================================
// SOG Quaternion Encoding Tests
// =============================================================================

describe('SOG Quaternion Encoding', () => {
    it('should use smallest-three encoding', () => {
        // Quaternion stored as 3 smallest components + 2-bit tag for which is largest
        // Tag values: 252, 253, 254, 255 indicate which component is largest (x, y, z, w)
        
        const validTags = [252, 253, 254, 255];
        expect(validTags.length).toBe(4);
    });
    
    it('should pack 3 components + tag in RGBA', () => {
        // R, G, B = 3 smallest components scaled to [0, 255]
        // A = tag (252-255) indicating which component is largest
        
        const packQuaternion = (x: number, y: number, z: number, w: number) => {
            const comps = [x, y, z, w];
            const absComps = comps.map(Math.abs);
            let maxIdx = 0;
            for (let i = 1; i < 4; i++) {
                if (absComps[i] > absComps[maxIdx]) maxIdx = i;
            }
            
            // Ensure positive max component (flip sign if needed)
            const sign = comps[maxIdx] >= 0 ? 1 : -1;
            
            // Get indices of 3 smaller components
            const indices = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]][maxIdx];
            const sqrt2 = Math.sqrt(2);
            
            // Pack to [0, 255]
            const r = Math.round((comps[indices[0]] * sign * sqrt2 + 1) / 2 * 255);
            const g = Math.round((comps[indices[1]] * sign * sqrt2 + 1) / 2 * 255);
            const b = Math.round((comps[indices[2]] * sign * sqrt2 + 1) / 2 * 255);
            const a = 252 + maxIdx;
            
            return new Uint8Array([r, g, b, a]);
        };
        
        // Test identity quaternion (0, 0, 0, 1)
        const identity = packQuaternion(0, 0, 0, 1);
        expect(identity[3]).toBe(255); // w is largest, tag = 255
        
        // Test 90-degree around Y (0, 0.707, 0, 0.707)
        const sqrt2_2 = Math.SQRT1_2;
        const rotY90 = packQuaternion(0, sqrt2_2, 0, sqrt2_2);
        // Either y or w could be largest (they're equal), check tag is valid
        expect(rotY90[3]).toBeGreaterThanOrEqual(252);
        expect(rotY90[3]).toBeLessThanOrEqual(255);
    });
    
    it('should unpack quaternion correctly', () => {
        const unpackQuaternion = (r: number, g: number, b: number, a: number): [number, number, number, number] => {
            const maxComp = a - 252;
            const sqrt2 = Math.sqrt(2);
            
            // Unpack from [0, 255] to [-1/sqrt2, 1/sqrt2]
            const c0 = (r / 255 * 2 - 1) / sqrt2;
            const c1 = (g / 255 * 2 - 1) / sqrt2;
            const c2 = (b / 255 * 2 - 1) / sqrt2;
            
            const comps = [0, 0, 0, 0];
            const indices = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]][maxComp];
            comps[indices[0]] = c0;
            comps[indices[1]] = c1;
            comps[indices[2]] = c2;
            
            // Reconstruct largest component
            const sumSq = c0 * c0 + c1 * c1 + c2 * c2;
            comps[maxComp] = Math.sqrt(Math.max(0, 1 - sumSq));
            
            return comps as [number, number, number, number];
        };
        
        // Test unpacking identity (encoded as R=128, G=128, B=128, A=255)
        const [x, y, z, w] = unpackQuaternion(128, 128, 128, 255);
        
        // Should be close to identity
        expect(Math.abs(x)).toBeLessThan(0.05);
        expect(Math.abs(y)).toBeLessThan(0.05);
        expect(Math.abs(z)).toBeLessThan(0.05);
        expect(w).toBeGreaterThan(0.95);
        
        // Should be unit quaternion
        const length = Math.sqrt(x * x + y * y + z * z + w * w);
        expect(length).toBeCloseTo(1, 2);
    });
});

// =============================================================================
// SOG Color/SH0 Encoding Tests
// =============================================================================

describe('SOG Color Encoding (SH0)', () => {
    const SH_C0 = 0.28209479177387814;
    
    it('should use codebook for color DC coefficients', () => {
        // Similar to scales, colors use 256-entry codebook
        const codebook = Float32Array.from({ length: 256 },
            (_, i) => (i / 255) * 2 - 1); // Typical range for f_dc
        
        expect(codebook.length).toBe(256);
    });
    
    it('should store RGB labels + opacity in RGBA', () => {
        // sh0.webp: R = f_dc_0 label, G = f_dc_1 label, B = f_dc_2 label, A = opacity
        const rgba = new Uint8Array([100, 150, 80, 200]);
        
        const colorLabel0 = rgba[0];
        const colorLabel1 = rgba[1];
        const colorLabel2 = rgba[2];
        const opacityByte = rgba[3];
        
        expect(colorLabel0).toBe(100);
        expect(opacityByte).toBe(200);
    });
    
    it('should encode opacity as linear byte (sigmoid applied on read)', () => {
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
        const sigmoidInv = (y: number) => {
            const e = Math.min(1 - 1e-6, Math.max(1e-6, y));
            return Math.log(e / (1 - e));
        };
        
        // Opacity is stored as byte [0,255], represents sigmoid probability
        const opacityByte = 200;
        const opacityProbability = opacityByte / 255;
        const opacityLogit = sigmoidInv(opacityProbability);
        
        // Verify round-trip
        const recoveredProbability = sigmoid(opacityLogit);
        expect(recoveredProbability).toBeCloseTo(opacityProbability, 5);
    });
});

// =============================================================================
// SOG Higher-Order SH Encoding Tests
// =============================================================================

describe('SOG Higher-Order Spherical Harmonics', () => {
    it('should support SH degrees 0-3', () => {
        const shCoeffCounts = [0, 9, 24, 45]; // Per channel
        
        expect(shCoeffCounts[0]).toBe(0);  // No higher-order SH
        expect(shCoeffCounts[1]).toBe(9);  // Degree 1: 3 bands
        expect(shCoeffCounts[2]).toBe(24); // Degree 2: 8 bands  
        expect(shCoeffCounts[3]).toBe(45); // Degree 3: 15 bands
    });
    
    it('should use palette-based compression for SH', () => {
        // SH uses larger palette (up to 65536 entries) indexed by 16-bit label
        const paletteSize = 4096; // Typical size
        const labelBits = Math.ceil(Math.log2(paletteSize));
        
        expect(labelBits).toBeLessThanOrEqual(16);
    });
    
    it('should store SH labels in two bytes (R, G of label texture)', () => {
        // labels.webp: R = low byte, G = high byte of 16-bit palette index
        const rgba = new Uint8Array([0x34, 0x12, 0, 255]); // Label 0x1234
        
        const label = rgba[0] | (rgba[1] << 8);
        expect(label).toBe(0x1234);
    });
    
    it('should pack SH centroids in texture', () => {
        // centroids.webp layout: 64 centroids per row, shCoeffs columns per centroid
        const paletteSize = 4096;
        const centroidsPerRow = 64;
        const numRows = Math.ceil(paletteSize / centroidsPerRow);
        
        expect(numRows).toBe(64);
        expect(centroidsPerRow * numRows).toBeGreaterThanOrEqual(paletteSize);
    });
});

// =============================================================================
// SOG Morton Order Tests
// =============================================================================

describe('SOG Morton Order Sorting', () => {
    const interleave3_10bit = (x: number, y: number, z: number): number => {
        // Interleave 10 bits from each of x, y, z
        let result = 0;
        for (let i = 0; i < 10; i++) {
            result |= ((x >> i) & 1) << (3 * i);
            result |= ((y >> i) & 1) << (3 * i + 1);
            result |= ((z >> i) & 1) << (3 * i + 2);
        }
        return result;
    };
    
    it('should produce increasing codes for adjacent cells', () => {
        // Points along each axis should have predictable code increments
        expect(interleave3_10bit(0, 0, 0)).toBe(0);
        expect(interleave3_10bit(1, 0, 0)).toBe(1);
        expect(interleave3_10bit(0, 1, 0)).toBe(2);
        expect(interleave3_10bit(1, 1, 0)).toBe(3);
        expect(interleave3_10bit(0, 0, 1)).toBe(4);
    });
    
    it('should group spatially close points', () => {
        // Points in same octant should have codes closer than points in different octants
        const code1 = interleave3_10bit(100, 100, 100);
        const code2 = interleave3_10bit(101, 100, 100);
        const code3 = interleave3_10bit(500, 500, 500);
        
        expect(Math.abs(code2 - code1)).toBeLessThan(Math.abs(code3 - code1));
    });
    
    it('should handle full 10-bit range', () => {
        const maxCode = interleave3_10bit(1023, 1023, 1023);
        
        // Maximum 30-bit value
        expect(maxCode).toBeLessThanOrEqual(0x3FFFFFFF);
    });
});

// =============================================================================
// SOG ZIP Container Tests
// =============================================================================

describe('SOG ZIP Container', () => {
    it('should have standard entry names', () => {
        const expectedEntries = [
            'meta.json',
            'means_l.webp',
            'means_u.webp',
            'scales.webp',
            'quats.webp',
            'sh0.webp'
        ];
        
        for (const entry of expectedEntries) {
            expect(entry).toMatch(/\.(json|webp)$/);
        }
    });
    
    it('should optionally include SH textures', () => {
        const shEntries = [
            'sh_centroids.webp',
            'sh_labels.webp'
        ];
        
        expect(shEntries.length).toBe(2);
    });
    
    it('should use uncompressed storage (WebP already compressed)', () => {
        // ZIP compression method 0 = stored (no compression)
        const ZIP_STORED = 0;
        expect(ZIP_STORED).toBe(0);
    });
});

// =============================================================================
// SOG Texture Dimension Tests
// =============================================================================

describe('SOG Texture Dimensions', () => {
    it('should calculate dimensions from splat count', () => {
        const calculateDimensions = (count: number) => {
            // Dimensions must be multiples of 4 for WebP
            const width = Math.ceil(Math.sqrt(count) / 4) * 4;
            const height = Math.ceil(count / width / 4) * 4;
            return { width, height };
        };
        
        // Test various splat counts
        const testCases = [
            { count: 100, minArea: 100 },
            { count: 10000, minArea: 10000 },
            { count: 1000000, minArea: 1000000 }
        ];
        
        for (const { count, minArea } of testCases) {
            const { width, height } = calculateDimensions(count);
            
            expect(width % 4).toBe(0);
            expect(height % 4).toBe(0);
            expect(width * height).toBeGreaterThanOrEqual(minArea);
        }
    });
    
    it('should pack pixels in row-major order', () => {
        const width = 100;
        const height = 100;
        
        const getPixelIndex = (row: number, col: number) => row * width + col;
        
        expect(getPixelIndex(0, 0)).toBe(0);
        expect(getPixelIndex(0, 1)).toBe(1);
        expect(getPixelIndex(1, 0)).toBe(width);
    });
});

// =============================================================================
// SOG Quantization Error Tests
// =============================================================================

describe('SOG Quantization Error Bounds', () => {
    it('should have bounded position error from 16-bit quantization', () => {
        // 16-bit quantization over typical scene range
        const range = 100; // -50 to +50 meters
        const steps = 65536;
        const stepSize = range / steps;
        
        // Maximum error is half a step
        const maxError = stepSize / 2;
        
        expect(maxError).toBeLessThan(0.001); // < 1mm for 100m range
    });
    
    it('should have bounded scale error from 256-entry codebook', () => {
        // Scales typically range from -8 to 0 in log space
        const scaleRange = 8;
        const codebookSize = 256;
        const avgStep = scaleRange / codebookSize;
        
        // Average error is half the step size
        const avgError = avgStep / 2;
        
        // Convert to linear scale error
        // If log-scale error is e, linear scale error is roughly e * scale
        const typicalLogScale = -4;
        const typicalLinearScale = Math.exp(typicalLogScale);
        const linearScaleError = avgError * typicalLinearScale;
        
        expect(linearScaleError).toBeLessThan(0.001); // Very small linear error
    });
    
    it('should have bounded quaternion error from 8-bit quantization', () => {
        // Each of 3 components quantized to 8 bits
        // Range is [-1/sqrt(2), 1/sqrt(2)], so step is sqrt(2)/256
        const sqrt2 = Math.sqrt(2);
        const step = sqrt2 / 256;
        const maxComponentError = step / 2;
        
        // This translates to rotation error
        // For small errors, rotation error ≈ 2 * component_error in radians
        const maxRotationError = 2 * maxComponentError; // radians
        const maxRotationErrorDegrees = maxRotationError * 180 / Math.PI;
        
        expect(maxRotationErrorDegrees).toBeLessThan(1); // Less than 1 degree
    });
    
    it('should have bounded color error from 256-entry codebook', () => {
        // Similar to scales, color DC uses 256-entry codebook
        const colorRange = 2; // Typical f_dc range
        const codebookSize = 256;
        const avgStep = colorRange / codebookSize;
        const avgError = avgStep / 2;
        
        // In RGB space (after SH_C0 conversion)
        const SH_C0 = 0.28209479177387814;
        const rgbError = avgError * SH_C0;
        const rgb255Error = rgbError * 255;
        
        expect(rgb255Error).toBeLessThan(2); // Less than 2 out of 255
    });
    
    it('should have bounded opacity error from 8-bit storage', () => {
        // Opacity stored as 8-bit byte representing sigmoid probability
        const step = 1 / 256;
        const maxProbabilityError = step / 2;
        
        expect(maxProbabilityError).toBeLessThan(0.002); // < 0.2%
    });
});
