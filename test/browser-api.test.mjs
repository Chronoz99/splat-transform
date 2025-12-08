/**
 * Browser API Tests
 * 
 * These tests validate the browser-compatible API by testing the core
 * functionality with ArrayBuffer inputs (simulating browser usage).
 * 
 * Run with: node --test test/browser-api.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the browser API functions (they also work in Node.js with ArrayBuffer inputs)
import { 
    read, 
    write, 
    convert, 
    merge,
    isGpuAvailable,
    getGpuAdapters,
    setQuiet
} from '../dist/browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PLY_PATH = join(__dirname, '..', 'data', 'raw_ply', 'vijay.ply');

// Suppress logs during tests
setQuiet(true);

describe('Browser API - read()', () => {
    let plyBuffer;

    before(async () => {
        // Load test file as ArrayBuffer
        const nodeBuffer = await readFile(TEST_PLY_PATH);
        plyBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset, 
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );
    });

    it('should read a PLY file from ArrayBuffer', async () => {
        const dataTable = await read(plyBuffer, { format: 'ply' });
        
        assert.ok(dataTable, 'DataTable should exist');
        assert.ok(dataTable.numRows > 0, 'Should have splat data');
        assert.ok(dataTable.columns.length > 0, 'Should have columns');
        
        // PLY files should have position columns
        const columnNames = dataTable.columns.map(c => c.name);
        assert.ok(columnNames.includes('x'), 'Should have x column');
        assert.ok(columnNames.includes('y'), 'Should have y column');
        assert.ok(columnNames.includes('z'), 'Should have z column');
    });

    it('should read with explicit format when filename not available', async () => {
        // In browser, we often get ArrayBuffer without filename
        // So we must specify the format explicitly
        const dataTable = await read(plyBuffer, { format: 'ply' });
        assert.ok(dataTable.numRows > 0, 'Should read data with explicit format');
    });

    it('should throw error if format cannot be detected', async () => {
        // ArrayBuffer without format specified should fail
        await assert.rejects(
            () => read(plyBuffer, {}),
            /Could not detect input format/
        );
    });
});

describe('Browser API - write()', () => {
    let dataTable;

    before(async () => {
        const nodeBuffer = await readFile(TEST_PLY_PATH);
        const plyBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset, 
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );
        dataTable = await read(plyBuffer, { format: 'ply' });
    });

    it('should write to PLY format', async () => {
        const buffer = await write(dataTable, 'ply');
        
        assert.ok(buffer instanceof ArrayBuffer, 'Should return ArrayBuffer');
        assert.ok(buffer.byteLength > 0, 'Buffer should have content');
        
        // Verify it's valid PLY by checking header
        const text = new TextDecoder().decode(buffer.slice(0, 100));
        assert.ok(text.startsWith('ply'), 'Should be valid PLY format');
    });

    it('should write to CSV format', async () => {
        const buffer = await write(dataTable, 'csv');
        
        assert.ok(buffer instanceof ArrayBuffer, 'Should return ArrayBuffer');
        assert.ok(buffer.byteLength > 0, 'Buffer should have content');
        
        // CSV should have column headers
        const text = new TextDecoder().decode(buffer.slice(0, 200));
        assert.ok(text.includes(','), 'Should have CSV delimiters');
    });

    it('should write to compressed-ply format', async () => {
        const buffer = await write(dataTable, 'compressed-ply');
        
        assert.ok(buffer instanceof ArrayBuffer, 'Should return ArrayBuffer');
        assert.ok(buffer.byteLength > 0, 'Buffer should have content');
        
        // Verify it starts with PLY header
        const text = new TextDecoder().decode(buffer.slice(0, 100));
        assert.ok(text.startsWith('ply'), 'Should be valid PLY format');
    });

    it('should write to SOG format with CPU fallback', async () => {
        const buffer = await write(dataTable, 'sog', { 
            useGpu: false,  // Force CPU to ensure it works in test environment
            sogIterations: 2  // Fewer iterations for faster tests
        });
        
        assert.ok(buffer instanceof ArrayBuffer, 'Should return ArrayBuffer');
        assert.ok(buffer.byteLength > 0, 'Buffer should have content');
    });
});

describe('Browser API - convert()', () => {
    let plyBuffer;

    before(async () => {
        const nodeBuffer = await readFile(TEST_PLY_PATH);
        plyBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset, 
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );
    });

    it('should convert PLY to PLY (round-trip)', async () => {
        const outputBuffer = await convert(plyBuffer, {
            inputFormat: 'ply',
            outputFormat: 'ply'
        });
        
        // Read back and verify
        const dataTable = await read(outputBuffer, { format: 'ply' });
        assert.ok(dataTable.numRows > 0, 'Round-trip should preserve data');
    });

    it('should convert with transforms', async () => {
        // Read original to get baseline
        const original = await read(plyBuffer, { format: 'ply' });
        const originalX = original.columns.find(c => c.name === 'x');
        const originalFirstX = originalX.data[0];
        
        // Convert with translation
        const outputBuffer = await convert(plyBuffer, {
            inputFormat: 'ply',
            outputFormat: 'ply',
            transforms: [
                { type: 'translate', x: 10, y: 0, z: 0 }
            ]
        });
        
        // Read converted and verify translation
        const converted = await read(outputBuffer, { format: 'ply' });
        const convertedX = converted.columns.find(c => c.name === 'x');
        const convertedFirstX = convertedX.data[0];
        
        assert.ok(
            Math.abs(convertedFirstX - originalFirstX - 10) < 0.001,
            'X should be translated by 10'
        );
    });

    it('should convert with scale transform', async () => {
        const original = await read(plyBuffer, { format: 'ply' });
        const originalX = original.columns.find(c => c.name === 'x');
        const originalFirstX = originalX.data[0];
        
        const outputBuffer = await convert(plyBuffer, {
            inputFormat: 'ply',
            outputFormat: 'ply',
            transforms: [
                { type: 'scale', factor: 2.0 }
            ]
        });
        
        const converted = await read(outputBuffer, { format: 'ply' });
        const convertedX = converted.columns.find(c => c.name === 'x');
        const convertedFirstX = convertedX.data[0];
        
        assert.ok(
            Math.abs(convertedFirstX - originalFirstX * 2) < 0.001,
            'X should be scaled by 2'
        );
    });

    it('should convert with filters', async () => {
        // Read original to get count
        const original = await read(plyBuffer, { format: 'ply' });
        
        // Apply box filter that should reduce count
        const outputBuffer = await convert(plyBuffer, {
            inputFormat: 'ply',
            outputFormat: 'ply',
            filters: [
                { type: 'nan' }  // Remove any NaN values
            ]
        });
        
        const filtered = await read(outputBuffer, { format: 'ply' });
        assert.ok(filtered.numRows > 0, 'Should have remaining data after filter');
        assert.ok(filtered.numRows <= original.numRows, 'Filter should not add data');
    });
});

describe('Browser API - merge()', () => {
    let plyBuffer;

    before(async () => {
        const nodeBuffer = await readFile(TEST_PLY_PATH);
        plyBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset, 
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );
    });

    it('should merge multiple inputs', async () => {
        const original = await read(plyBuffer, { format: 'ply' });
        const originalCount = original.numRows;
        
        // Merge same file twice
        const mergedBuffer = await merge([
            { data: plyBuffer, format: 'ply' },
            { data: plyBuffer, format: 'ply' }
        ], {
            outputFormat: 'ply'
        });
        
        const merged = await read(mergedBuffer, { format: 'ply' });
        assert.strictEqual(merged.numRows, originalCount * 2, 'Merged should have double the rows');
    });

    it('should merge with per-input transforms', async () => {
        const mergedBuffer = await merge([
            { data: plyBuffer, format: 'ply' },
            { 
                data: plyBuffer, 
                format: 'ply',
                transforms: [{ type: 'translate', x: 100, y: 0, z: 0 }]
            }
        ], {
            outputFormat: 'ply'
        });
        
        const merged = await read(mergedBuffer, { format: 'ply' });
        const xCol = merged.columns.find(c => c.name === 'x');
        
        // Should have some values near original and some translated
        const original = await read(plyBuffer, { format: 'ply' });
        const originalX = original.columns.find(c => c.name === 'x');
        const firstX = originalX.data[0];
        
        // Check that we have values in both ranges
        let hasNearOriginal = false;
        let hasTranslated = false;
        for (let i = 0; i < xCol.data.length; i++) {
            if (Math.abs(xCol.data[i] - firstX) < 50) hasNearOriginal = true;
            if (Math.abs(xCol.data[i] - (firstX + 100)) < 50) hasTranslated = true;
        }
        
        assert.ok(hasNearOriginal, 'Should have original position values');
        assert.ok(hasTranslated, 'Should have translated position values');
    });
});

describe('Browser API - GPU utilities', () => {
    it('should check GPU availability', async () => {
        const available = await isGpuAvailable();
        assert.strictEqual(typeof available, 'boolean', 'Should return boolean');
    });

    it('should enumerate GPU adapters', async () => {
        const adapters = await getGpuAdapters();
        assert.ok(Array.isArray(adapters), 'Should return array');
        // May be empty if no GPU available
    });
});

describe('Browser API - SOG format round-trip', () => {
    let plyBuffer;

    before(async () => {
        const nodeBuffer = await readFile(TEST_PLY_PATH);
        plyBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset, 
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );
    });

    it('should convert PLY to SOG and back', async () => {
        // Read original
        const original = await read(plyBuffer, { format: 'ply' });
        
        // Convert to SOG (bundled mode for single file)
        const sogBuffer = await convert(plyBuffer, {
            inputFormat: 'ply',
            outputFormat: 'sog',
            useGpu: false,  // CPU for test environment
            sogIterations: 2
        });
        
        assert.ok(sogBuffer.byteLength > 0, 'SOG buffer should have content');
        
        // Read back the SOG file
        const fromSog = await read(sogBuffer, { format: 'sog' });
        
        // SOG is lossy, so row count may differ, but should have data
        assert.ok(fromSog.numRows > 0, 'Should read back SOG data');
        
        // Should have position columns
        const columnNames = fromSog.columns.map(c => c.name);
        assert.ok(columnNames.includes('x'), 'Should have x column');
        assert.ok(columnNames.includes('y'), 'Should have y column');
        assert.ok(columnNames.includes('z'), 'Should have z column');
    });
});
