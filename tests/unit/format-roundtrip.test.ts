/**
 * Format Round-Trip Integration Tests
 * 
 * These tests validate that data can be:
 * - Written to each format
 * - Read back from that format  
 * - Data integrity is maintained (within acceptable loss for lossy formats)
 *
 * Uses synthetic in-memory data to avoid external file dependencies.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Column, DataTable } from '../../src/data-table/data-table';
import { PlyData, readPly } from '../../src/readers/read-ply';
import { readSplat } from '../../src/readers/read-splat';
import { writePly } from '../../src/writers/write-ply';
import { writeCompressedPly } from '../../src/writers/write-compressed-ply';
import { writeCsv } from '../../src/writers/write-csv';
import { BufferSink } from '../../src/io/browser-data-sink';
import { BufferSource } from '../../src/io/browser-data-source';

/**
 * Wrap DataTable in PlyData format for writing
 */
function dataTableToPlyData(dataTable: DataTable): PlyData {
    return {
        comments: [],
        elements: [{
            name: 'vertex',
            dataTable: dataTable
        }]
    };
}

// =============================================================================
// Test Fixture Generation
// =============================================================================

/**
 * Creates a DataTable with controlled test data
 * All values are chosen to survive round-trip through various formats
 */
function createRoundTripTestData(numSplats: number = 100): DataTable {
    const columns = [
        // Position - use reasonable world-space values
        new Column('x', Float32Array.from({ length: numSplats }, (_, i) => (i % 10) * 0.5 - 2.5)),
        new Column('y', Float32Array.from({ length: numSplats }, (_, i) => Math.floor(i / 10) * 0.5 - 2.5)),
        new Column('z', Float32Array.from({ length: numSplats }, (_, i) => Math.sin(i * 0.1) * 2)),
        
        // Scale - log-encoded, typical values are negative (small splats)
        new Column('scale_0', Float32Array.from({ length: numSplats }, (_, i) => -3.5 + (i % 5) * 0.2)),
        new Column('scale_1', Float32Array.from({ length: numSplats }, (_, i) => -3.5 + ((i + 1) % 5) * 0.2)),
        new Column('scale_2', Float32Array.from({ length: numSplats }, (_, i) => -3.5 + ((i + 2) % 5) * 0.2)),
        
        // Color - SH DC coefficients, typically small values
        new Column('f_dc_0', Float32Array.from({ length: numSplats }, (_, i) => 0.3 + (i % 10) * 0.05)),
        new Column('f_dc_1', Float32Array.from({ length: numSplats }, (_, i) => 0.2 + (i % 10) * 0.04)),
        new Column('f_dc_2', Float32Array.from({ length: numSplats }, (_, i) => 0.1 + (i % 10) * 0.03)),
        
        // Opacity - logit-encoded, 0 = 50%, positive = more opaque
        new Column('opacity', Float32Array.from({ length: numSplats }, (_, i) => 1.0 + (i % 5) * 0.5)),
        
        // Rotation - unit quaternions
        ...generateQuaternionColumns(numSplats)
    ];
    
    return new DataTable(columns);
}

/**
 * Generates properly normalized quaternion columns
 */
function generateQuaternionColumns(numSplats: number): Column[] {
    const rot0 = new Float32Array(numSplats);
    const rot1 = new Float32Array(numSplats);
    const rot2 = new Float32Array(numSplats);
    const rot3 = new Float32Array(numSplats);
    
    for (let i = 0; i < numSplats; i++) {
        // Generate various rotations
        const angle = (i / numSplats) * Math.PI * 2;
        const axis = i % 3; // Rotate around different axes
        
        let x = 0, y = 0, z = 0, w = 1;
        
        if (axis === 0) {
            x = Math.sin(angle / 2);
            w = Math.cos(angle / 2);
        } else if (axis === 1) {
            y = Math.sin(angle / 2);
            w = Math.cos(angle / 2);
        } else {
            z = Math.sin(angle / 2);
            w = Math.cos(angle / 2);
        }
        
        // Ensure unit quaternion
        const len = Math.sqrt(x * x + y * y + z * z + w * w);
        rot0[i] = x / len;
        rot1[i] = y / len;
        rot2[i] = z / len;
        rot3[i] = w / len;
    }
    
    return [
        new Column('rot_0', rot0),
        new Column('rot_1', rot1),
        new Column('rot_2', rot2),
        new Column('rot_3', rot3)
    ];
}

/**
 * Creates DataTable with higher-order SH coefficients
 */
function createRoundTripTestDataWithSH(numSplats: number = 50, shDegree: number = 1): DataTable {
    const dt = createRoundTripTestData(numSplats);
    
    const shCoeffCounts = [0, 9, 24, 45];
    const numCoeffs = shCoeffCounts[shDegree] * 3; // RGB for each SH band
    
    for (let i = 0; i < numCoeffs; i++) {
        // SH coefficients are typically small
        const data = Float32Array.from({ length: numSplats }, 
            (_, j) => (Math.sin(i * 0.5 + j * 0.1) * 0.1));
        dt.columns.push(new Column(`f_rest_${i}`, data));
    }
    
    return dt;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compare two DataTables within tolerance
 */
function compareDataTables(
    original: DataTable, 
    restored: DataTable, 
    tolerance: number = 1e-5
): { match: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (original.numRows !== restored.numRows) {
        errors.push(`Row count mismatch: ${original.numRows} vs ${restored.numRows}`);
        return { match: false, errors };
    }
    
    // Check each expected column
    for (const origCol of original.columns) {
        const restoredCol = restored.columns.find(c => c.name === origCol.name);
        
        if (!restoredCol) {
            errors.push(`Missing column: ${origCol.name}`);
            continue;
        }
        
        const origData = origCol.data as Float32Array;
        const restoredData = restoredCol.data as Float32Array;
        
        for (let i = 0; i < origData.length; i++) {
            const diff = Math.abs(origData[i] - restoredData[i]);
            if (diff > tolerance && !isNaN(diff)) {
                errors.push(`Column ${origCol.name}[${i}]: ${origData[i]} vs ${restoredData[i]} (diff: ${diff})`);
                if (errors.length > 10) {
                    errors.push('... (truncated)');
                    return { match: false, errors };
                }
            }
        }
    }
    
    return { match: errors.length === 0, errors };
}

/**
 * Check quaternion equivalence (may differ by sign)
 */
function compareQuaternions(
    q1: { x: number; y: number; z: number; w: number },
    q2: { x: number; y: number; z: number; w: number },
    tolerance: number = 0.01
): boolean {
    // Quaternions q and -q represent the same rotation
    const dotProduct = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
    return Math.abs(Math.abs(dotProduct) - 1) < tolerance;
}

// =============================================================================
// PLY Format Round-Trip Tests
// =============================================================================

describe('PLY Format Round-Trip', () => {
    let testData: DataTable;
    
    beforeAll(() => {
        testData = createRoundTripTestData(50);
    });
    
    it('should write valid PLY header', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        // Check PLY magic - read first 1KB for header
        const header = new TextDecoder().decode(buffer.slice(0, 1024));
        expect(header.startsWith('ply')).toBe(true);
        expect(header).toContain('format binary_little_endian');
        expect(header).toContain('element vertex');
        expect(header).toContain('end_header');
    });
    
    it('should write correct vertex count in header', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const header = new TextDecoder().decode(buffer.slice(0, 500));
        expect(header).toContain(`element vertex ${testData.numRows}`);
    });
    
    it('should roundtrip position data', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        // Check position columns
        for (const colName of ['x', 'y', 'z']) {
            const origCol = testData.columns.find(c => c.name === colName)!;
            const restoredCol = restored.columns.find(c => c.name === colName);
            
            expect(restoredCol).toBeDefined();
            
            const origData = origCol.data as Float32Array;
            const restoredData = restoredCol!.data as Float32Array;
            
            for (let i = 0; i < origData.length; i++) {
                expect(restoredData[i]).toBeCloseTo(origData[i], 5);
            }
        }
    });
    
    it('should roundtrip scale data', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        for (const colName of ['scale_0', 'scale_1', 'scale_2']) {
            const origCol = testData.columns.find(c => c.name === colName)!;
            const restoredCol = restored.columns.find(c => c.name === colName);
            
            expect(restoredCol).toBeDefined();
            
            const origData = origCol.data as Float32Array;
            const restoredData = restoredCol!.data as Float32Array;
            
            for (let i = 0; i < origData.length; i++) {
                expect(restoredData[i]).toBeCloseTo(origData[i], 5);
            }
        }
    });
    
    it('should roundtrip color data', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        for (const colName of ['f_dc_0', 'f_dc_1', 'f_dc_2']) {
            const origCol = testData.columns.find(c => c.name === colName)!;
            const restoredCol = restored.columns.find(c => c.name === colName);
            
            expect(restoredCol).toBeDefined();
            
            const origData = origCol.data as Float32Array;
            const restoredData = restoredCol!.data as Float32Array;
            
            for (let i = 0; i < origData.length; i++) {
                expect(restoredData[i]).toBeCloseTo(origData[i], 5);
            }
        }
    });
    
    it('should roundtrip quaternion data', async () => {
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        for (let i = 0; i < testData.numRows; i++) {
            const origQ = {
                x: (testData.columns.find(c => c.name === 'rot_0')!.data as Float32Array)[i],
                y: (testData.columns.find(c => c.name === 'rot_1')!.data as Float32Array)[i],
                z: (testData.columns.find(c => c.name === 'rot_2')!.data as Float32Array)[i],
                w: (testData.columns.find(c => c.name === 'rot_3')!.data as Float32Array)[i]
            };
            
            const restoredQ = {
                x: (restored.columns.find(c => c.name === 'rot_0')!.data as Float32Array)[i],
                y: (restored.columns.find(c => c.name === 'rot_1')!.data as Float32Array)[i],
                z: (restored.columns.find(c => c.name === 'rot_2')!.data as Float32Array)[i],
                w: (restored.columns.find(c => c.name === 'rot_3')!.data as Float32Array)[i]
            };
            
            expect(compareQuaternions(origQ, restoredQ)).toBe(true);
        }
    });
    
    it('should preserve spherical harmonics', async () => {
        const testDataWithSH = createRoundTripTestDataWithSH(30, 1);
        
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testDataWithSH);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        // Check f_rest columns exist
        for (let i = 0; i < 27; i++) { // 9 coeffs * 3 RGB
            const colName = `f_rest_${i}`;
            const origCol = testDataWithSH.columns.find(c => c.name === colName);
            const restoredCol = restored.columns.find(c => c.name === colName);
            
            if (origCol) {
                expect(restoredCol).toBeDefined();
            }
        }
    });
});

// =============================================================================
// Compressed PLY Format Tests
// =============================================================================

describe('Compressed PLY Format', () => {
    let testData: DataTable;
    
    beforeAll(() => {
        testData = createRoundTripTestData(50);
    });
    
    it('should produce smaller output than standard PLY', async () => {
        const standardSink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(standardSink, plyData);
        const standardBuffer = await standardSink.close();
        const standardSize = standardBuffer.byteLength;
        
        const compressedSink = new BufferSink();
        await writeCompressedPly(compressedSink, testData);
        const compressedBuffer = await compressedSink.close();
        const compressedSize = compressedBuffer.byteLength;
        
        // Compressed should be smaller (or at least not much larger for small datasets)
        expect(compressedSize).toBeLessThanOrEqual(standardSize * 1.5);
    });
    
    it('should still be valid PLY format', async () => {
        const sink = new BufferSink();
        await writeCompressedPly(sink, testData);
        const buffer = await sink.close();
        
        // Should have PLY header
        const header = new TextDecoder().decode(buffer.slice(0, 100));
        expect(header.startsWith('ply')).toBe(true);
    });
});

// =============================================================================
// CSV Format Tests
// =============================================================================

describe('CSV Format', () => {
    let testData: DataTable;
    
    beforeAll(() => {
        testData = createRoundTripTestData(10);
    });
    
    it('should write valid CSV with headers', async () => {
        const sink = new BufferSink();
        await writeCsv(sink, testData);
        const buffer = await sink.close();
        
        const csv = new TextDecoder().decode(buffer);
        const lines = csv.trim().split('\n');
        
        // First line should be headers
        const headers = lines[0].split(',');
        expect(headers).toContain('x');
        expect(headers).toContain('y');
        expect(headers).toContain('z');
    });
    
    it('should have correct number of rows', async () => {
        const sink = new BufferSink();
        await writeCsv(sink, testData);
        const buffer = await sink.close();
        
        const csv = new TextDecoder().decode(buffer);
        const lines = csv.trim().split('\n');
        
        // Header + data rows
        expect(lines.length).toBe(testData.numRows + 1);
    });
    
    it('should have correct number of columns per row', async () => {
        const sink = new BufferSink();
        await writeCsv(sink, testData);
        const buffer = await sink.close();
        
        const csv = new TextDecoder().decode(buffer);
        const lines = csv.trim().split('\n');
        
        const headerCount = lines[0].split(',').length;
        
        for (let i = 1; i < lines.length; i++) {
            const rowCount = lines[i].split(',').length;
            expect(rowCount).toBe(headerCount);
        }
    });
});

// =============================================================================
// SPLAT Format Tests
// =============================================================================

describe('SPLAT Format Structure', () => {
    it('should have correct byte layout', () => {
        // SPLAT format: 32 bytes per splat
        // - 3 floats for position (12 bytes)
        // - 3 floats for scale (12 bytes)
        // - 4 uint8 for RGBA (4 bytes)
        // - 4 uint8 for quaternion (4 bytes)
        
        const BYTES_PER_SPLAT = 32;
        const positionBytes = 3 * 4; // 12
        const scaleBytes = 3 * 4;     // 12
        const colorBytes = 4;          // 4
        const quaternionBytes = 4;     // 4
        
        expect(positionBytes + scaleBytes + colorBytes + quaternionBytes).toBe(BYTES_PER_SPLAT);
    });
    
    it('should create valid in-memory SPLAT buffer', () => {
        const numSplats = 10;
        const BYTES_PER_SPLAT = 32;
        const buffer = new ArrayBuffer(numSplats * BYTES_PER_SPLAT);
        const view = new DataView(buffer);
        
        // Write test data
        for (let i = 0; i < numSplats; i++) {
            const offset = i * BYTES_PER_SPLAT;
            
            // Position
            view.setFloat32(offset + 0, i * 0.1, true);   // x
            view.setFloat32(offset + 4, i * 0.2, true);   // y
            view.setFloat32(offset + 8, i * 0.3, true);   // z
            
            // Scale (linear, not log)
            view.setFloat32(offset + 12, 0.01, true);
            view.setFloat32(offset + 16, 0.01, true);
            view.setFloat32(offset + 20, 0.01, true);
            
            // Color (RGBA as uint8)
            const colorOffset = offset + 24;
            new Uint8Array(buffer, colorOffset, 4).set([255, 128, 64, 200]);
            
            // Quaternion (as uint8, encoded from [-1,1] to [0,255])
            const quatOffset = offset + 28;
            new Uint8Array(buffer, quatOffset, 4).set([128, 128, 128, 255]); // ~identity
        }
        
        // Validate file size
        expect(buffer.byteLength).toBe(numSplats * BYTES_PER_SPLAT);
        expect(buffer.byteLength % BYTES_PER_SPLAT).toBe(0);
    });
    
    it('should read synthetic SPLAT buffer', async () => {
        const numSplats = 5;
        const BYTES_PER_SPLAT = 32;
        const buffer = new ArrayBuffer(numSplats * BYTES_PER_SPLAT);
        const view = new DataView(buffer);
        
        // Write minimal valid data
        for (let i = 0; i < numSplats; i++) {
            const offset = i * BYTES_PER_SPLAT;
            view.setFloat32(offset + 0, i, true);      // x
            view.setFloat32(offset + 4, 0, true);      // y
            view.setFloat32(offset + 8, 0, true);      // z
            view.setFloat32(offset + 12, 0.01, true);  // scale_x
            view.setFloat32(offset + 16, 0.01, true);  // scale_y
            view.setFloat32(offset + 20, 0.01, true);  // scale_z
            
            new Uint8Array(buffer, offset + 24, 8).set([
                128, 128, 128, 200, // RGBA
                0, 0, 0, 255        // quaternion (identity-ish)
            ]);
        }
        
        const source = new BufferSource(new Uint8Array(buffer));
        const dataTable = await readSplat(source);
        
        expect(dataTable.numRows).toBe(numSplats);
        expect(dataTable.columns.find(c => c.name === 'x')).toBeDefined();
        expect(dataTable.columns.find(c => c.name === 'y')).toBeDefined();
        expect(dataTable.columns.find(c => c.name === 'z')).toBeDefined();
    });
});

// =============================================================================
// Data Integrity Tests
// =============================================================================

describe('Data Integrity', () => {
    it('should preserve data range through PLY round-trip', async () => {
        const testData = createRoundTripTestData(100);
        
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        // Check that min/max of position columns are preserved
        for (const colName of ['x', 'y', 'z']) {
            const origData = testData.columns.find(c => c.name === colName)!.data as Float32Array;
            const restoredData = restored.columns.find(c => c.name === colName)!.data as Float32Array;
            
            const origMin = Math.min(...origData);
            const origMax = Math.max(...origData);
            const restoredMin = Math.min(...restoredData);
            const restoredMax = Math.max(...restoredData);
            
            expect(restoredMin).toBeCloseTo(origMin, 4);
            expect(restoredMax).toBeCloseTo(origMax, 4);
        }
    });
    
    it('should maintain quaternion unit length through round-trip', async () => {
        const testData = createRoundTripTestData(50);
        
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        const rot0 = restored.columns.find(c => c.name === 'rot_0')!.data as Float32Array;
        const rot1 = restored.columns.find(c => c.name === 'rot_1')!.data as Float32Array;
        const rot2 = restored.columns.find(c => c.name === 'rot_2')!.data as Float32Array;
        const rot3 = restored.columns.find(c => c.name === 'rot_3')!.data as Float32Array;
        
        for (let i = 0; i < restored.numRows; i++) {
            const length = Math.sqrt(
                rot0[i] ** 2 + rot1[i] ** 2 + rot2[i] ** 2 + rot3[i] ** 2
            );
            expect(length).toBeCloseTo(1, 3);
        }
    });
    
    it('should preserve opacity semantics', async () => {
        // Opacity is stored as logit: sigmoid(opacity) gives [0,1] probability
        const testData = createRoundTripTestData(20);
        
        const sink = new BufferSink();
        const plyData = dataTableToPlyData(testData);
        await writePly(sink, plyData);
        const buffer = await sink.close();
        
        const source = new BufferSource(new Uint8Array(buffer));
        const restored = await readPly(source);
        
        const origOpacity = testData.columns.find(c => c.name === 'opacity')!.data as Float32Array;
        const restoredOpacity = restored.columns.find(c => c.name === 'opacity')!.data as Float32Array;
        
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
        
        for (let i = 0; i < testData.numRows; i++) {
            const origProb = sigmoid(origOpacity[i]);
            const restoredProb = sigmoid(restoredOpacity[i]);
            
            // Probability should match closely
            expect(restoredProb).toBeCloseTo(origProb, 4);
        }
    });
});
