/**
 * Browser API for splat-transform
 *
 * This module provides a browser-compatible API for converting and manipulating
 * Gaussian splat files. It accepts ArrayBuffer/File/Blob inputs and returns
 * ArrayBuffer/Blob outputs.
 *
 * @example
 * ```typescript
 * import { convert, read, write, isGpuAvailable } from '@playcanvas/splat-transform/browser';
 *
 * // Check GPU availability
 * const gpuAvailable = await isGpuAvailable();
 *
 * // Convert a .splat file to .ply
 * const plyBuffer = await convert(splatFile, {
 *     outputFormat: 'ply'
 * });
 *
 * // Read splat data for inspection
 * const dataTable = await read(splatFile, 'splat');
 * console.log('Rows:', dataTable.numRows);
 *
 * // Write DataTable to a format
 * const sogBuffer = await write(dataTable, 'sog');
 * ```
 */

import { Quat, Vec3 } from 'playcanvas';

import { Column, DataTable, TypedArray } from './data-table';
import { isGpuAvailable as checkGpuAvailable, enumerateGpuAdapters } from './gpu/gpu-factory';
import { BufferSink, DataSink } from './io/browser-data-sink';
import { BufferSource, BlobSource, DataSource } from './io/browser-data-source';
import { logger } from './logger';
import { ProcessAction, processDataTable } from './process';
import { readSogBrowser } from './readers/browser-read-sog';
import { isCompressedPly, decompressPly } from './readers/decompress-ply';
import { readKsplat } from './readers/read-ksplat';
import { readPly } from './readers/read-ply';
import { readSplat } from './readers/read-splat';
import { readSpz } from './readers/read-spz';
import { writeSogBrowser } from './writers/browser-write-sog';
import { writeCompressedPly } from './writers/write-compressed-ply';
import { writeCsv } from './writers/write-csv';
import { writePly } from './writers/write-ply';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported input formats for reading splat data
 * Note: 'lcc' format is not supported in browser (requires Node.js filesystem access)
 */
export type InputFormat = 'ksplat' | 'splat' | 'sog' | 'ply' | 'spz';

/**
 * Supported output formats for writing splat data
 */
export type OutputFormat = 'csv' | 'sog' | 'compressed-ply' | 'ply';

/**
 * Transform to translate splat positions
 */
export interface TranslateTransform {
    type: 'translate';
    x: number;
    y: number;
    z: number;
}

/**
 * Transform to rotate splats (Euler angles in degrees)
 */
export interface RotateTransform {
    type: 'rotate';
    x: number;
    y: number;
    z: number;
}

/**
 * Transform to scale splats uniformly
 */
export interface ScaleTransform {
    type: 'scale';
    factor: number;
}

/**
 * Union type for all transforms
 */
export type Transform = TranslateTransform | RotateTransform | ScaleTransform;

/**
 * Filter to remove NaN/Infinity values
 */
export interface NaNFilter {
    type: 'nan';
}

/**
 * Filter by bounding box
 */
export interface BoxFilter {
    type: 'box';
    min: [number, number, number];
    max: [number, number, number];
}

/**
 * Filter by sphere
 */
export interface SphereFilter {
    type: 'sphere';
    center: [number, number, number];
    radius: number;
}

/**
 * Filter by column value comparison
 */
export interface ValueFilter {
    type: 'value';
    column: string;
    comparator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
    value: number;
}

/**
 * Filter spherical harmonic bands (0-3)
 */
export interface BandsFilter {
    type: 'bands';
    value: 0 | 1 | 2 | 3;
}

/**
 * Union type for all filters
 */
export type Filter = NaNFilter | BoxFilter | SphereFilter | ValueFilter | BandsFilter;

/**
 * Options for reading splat data
 */
export interface ReadOptions {
    /**
     * Input format. If not specified, will be auto-detected from file extension or content.
     */
    format?: InputFormat;

    /**
     * For multi-file formats (sog, lcc), provide companion files as a map.
     */
    companionFiles?: Map<string, ArrayBuffer | Uint8Array>;
}

/**
 * Options for writing splat data
 */
export interface WriteOptions {
    /**
     * Use GPU acceleration for clustering (SOG format)
     */
    useGpu?: boolean;

    /**
     * Number of k-means iterations for SOG format (default: 8)
     */
    sogIterations?: number;

    /**
     * Bundle all data into single file (SOG format, default: true for browser)
     */
    bundled?: boolean;
}

/**
 * Options for converting splat data
 */
export interface ConvertOptions extends WriteOptions {
    /**
     * Input format. If not specified, will be auto-detected.
     */
    inputFormat?: InputFormat;

    /**
     * Output format (required)
     */
    outputFormat: OutputFormat;

    /**
     * Transforms to apply to the data
     */
    transforms?: Transform[];

    /**
     * Filters to apply to the data
     */
    filters?: Filter[];

    /**
     * For multi-file input formats, provide companion files
     */
    companionFiles?: Map<string, ArrayBuffer | Uint8Array>;
}

/**
 * Input for merge operation
 */
export interface MergeInput {
    /**
     * The input data
     */
    data: ArrayBuffer | File | Blob;

    /**
     * Input format (auto-detected if not specified)
     */
    format?: InputFormat;

    /**
     * Transforms to apply to this input before merging
     */
    transforms?: Transform[];

    /**
     * Companion files for multi-file formats
     */
    companionFiles?: Map<string, ArrayBuffer | Uint8Array>;
}

/**
 * Options for merge operation
 */
export interface MergeOptions extends WriteOptions {
    /**
     * Output format (required)
     */
    outputFormat: OutputFormat;

    /**
     * Filters to apply after merging
     */
    filters?: Filter[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert browser-friendly transform to internal ProcessAction
 * @param transform - The transform to convert
 * @returns Internal ProcessAction representation
 */
const transformToProcessAction = (transform: Transform): ProcessAction => {
    switch (transform.type) {
        case 'translate':
            return { kind: 'translate', value: new Vec3(transform.x, transform.y, transform.z) };
        case 'rotate':
            return { kind: 'rotate', value: new Vec3(transform.x, transform.y, transform.z) };
        case 'scale':
            return { kind: 'scale', value: transform.factor };
    }
};

/**
 * Convert browser-friendly filter to internal ProcessAction
 * @param filter - The filter to convert
 * @returns Internal ProcessAction representation
 */
const filterToProcessAction = (filter: Filter): ProcessAction => {
    switch (filter.type) {
        case 'nan':
            return { kind: 'filterNaN' };
        case 'box':
            return {
                kind: 'filterBox',
                min: new Vec3(filter.min[0], filter.min[1], filter.min[2]),
                max: new Vec3(filter.max[0], filter.max[1], filter.max[2])
            };
        case 'sphere':
            return {
                kind: 'filterSphere',
                center: new Vec3(filter.center[0], filter.center[1], filter.center[2]),
                radius: filter.radius
            };
        case 'value':
            return {
                kind: 'filterByValue',
                columnName: filter.column,
                comparator: filter.comparator,
                value: filter.value
            };
        case 'bands':
            return { kind: 'filterBands', value: filter.value };
    }
};

/**
 * Detect input format from file name or content
 * @param input - The input data
 * @returns Detected format or null if unknown
 */
const detectInputFormat = (input: ArrayBuffer | File | Blob): InputFormat | null => {
    // Try to get filename from File
    if (input instanceof File) {
        const name = input.name.toLowerCase();
        if (name.endsWith('.ksplat')) return 'ksplat';
        if (name.endsWith('.splat')) return 'splat';
        if (name.endsWith('.sog') || name.endsWith('meta.json')) return 'sog';
        if (name.endsWith('.ply')) return 'ply';
        if (name.endsWith('.spz')) return 'spz';
        // Note: 'lcc' format is not supported in browser
    }
    return null;
};

/**
 * Create a DataSource from various input types
 * @param input - The input data
 * @returns A DataSource wrapping the input
 */
const createSource = (input: ArrayBuffer | File | Blob): DataSource => {
    if (input instanceof ArrayBuffer) {
        return new BufferSource(input);
    }
    // Check for File/Blob - both have slice and arrayBuffer methods
    if (typeof (input as Blob).slice === 'function' && typeof (input as Blob).arrayBuffer === 'function') {
        return new BlobSource(input as Blob);
    }
    throw new Error('Unsupported input type');
};

/**
 * Read data from source based on format
 * @param source - The DataSource to read from
 * @param format - The input format
 * @param companionFiles - Optional companion files for multi-file formats
 * @returns Array of DataTables
 */
const readFromSource = async (
    source: DataSource,
    format: InputFormat,
    companionFiles?: Map<string, ArrayBuffer | Uint8Array>
): Promise<DataTable[]> => {
    switch (format) {
        case 'ksplat':
            return [await readKsplat(source)];
        case 'splat':
            return [await readSplat(source)];
        case 'sog':
            return [await readSogBrowser(source, { companionFiles })];
        case 'ply': {
            const ply = await readPly(source);
            if (isCompressedPly(ply)) {
                return [decompressPly(ply)];
            }
            if (ply.elements.length !== 1 || ply.elements[0].name !== 'vertex') {
                throw new Error('Unsupported PLY structure');
            }
            return [ply.elements[0].dataTable];
        }
        case 'spz':
            return [await readSpz(source)];
    }
};

/**
 * Write DataTable to sink based on format
 * @param sink - The DataSink to write to
 * @param dataTable - The DataTable to write
 * @param format - The output format
 * @param options - Write options
 */
const writeToSink = async (
    sink: DataSink,
    dataTable: DataTable,
    format: OutputFormat,
    options: WriteOptions
): Promise<void> => {
    switch (format) {
        case 'csv':
            await writeCsv(sink, dataTable);
            break;
        case 'sog':
            await writeSogBrowser(sink, dataTable, {
                iterations: options.sogIterations ?? 8,
                useGpu: options.useGpu ?? true
            });
            break;
        case 'compressed-ply':
            await writeCompressedPly(sink, dataTable);
            break;
        case 'ply':
            await writePly(sink, {
                comments: [],
                elements: [{
                    name: 'vertex',
                    dataTable: dataTable
                }]
            });
            break;
    }
};

/**
 * Combine multiple DataTables into one
 * @param dataTables - Array of DataTables to combine
 * @returns Combined DataTable
 */
const combine = (dataTables: DataTable[]): DataTable => {
    if (dataTables.length === 1) {
        return dataTables[0];
    }

    const findMatchingColumn = (columns: Column[], column: Column) => {
        for (const col of columns) {
            if (col.name === column.name && col.dataType === column.dataType) {
                return col;
            }
        }
        return null;
    };

    // Build combined columns
    const totalRows = dataTables.reduce((sum, dt) => sum + dt.numRows, 0);
    const combinedColumns: Column[] = [];

    // Start with columns from first table
    for (const col of dataTables[0].columns) {
        const ArrayType = col.data.constructor as new (n: number) => TypedArray;
        combinedColumns.push(new Column(col.name, new ArrayType(totalRows)));
    }

    // Copy data from each table
    let offset = 0;
    for (const dt of dataTables) {
        for (const col of dt.columns) {
            const targetCol = findMatchingColumn(combinedColumns, col);
            if (targetCol) {
                targetCol.data.set(col.data, offset);
            }
        }
        offset += dt.numRows;
    }

    return new DataTable(combinedColumns);
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if WebGPU is available in the current environment.
 * @returns True if GPU acceleration is available
 */
// eslint-disable-next-line require-await
export async function isGpuAvailable(): Promise<boolean> {
    return checkGpuAvailable();
}

/**
 * Get information about available GPU adapters.
 * @returns Array of adapter information objects
 */
// eslint-disable-next-line require-await
export async function getGpuAdapters(): Promise<Array<{ index: number; name: string }>> {
    return enumerateGpuAdapters();
}

/**
 * Read splat data from a file or buffer.
 *
 * @param input - The input data (ArrayBuffer, File, or Blob)
 * @param options - Read options including format and companion files
 * @returns DataTable containing the splat data
 *
 * @example
 * ```typescript
 * // Read from File input
 * const dataTable = await read(file);
 * console.log('Splat count:', dataTable.numRows);
 *
 * // Read with explicit format
 * const dataTable = await read(buffer, { format: 'splat' });
 * ```
 */
export async function read(
    input: ArrayBuffer | File | Blob,
    options: ReadOptions = {}
): Promise<DataTable> {
    const format = options.format ?? detectInputFormat(input);
    if (!format) {
        throw new Error('Could not detect input format. Please specify the format option.');
    }

    const source = createSource(input);
    try {
        const tables = await readFromSource(source, format, options.companionFiles);
        return combine(tables);
    } finally {
        await source.close();
    }
}

/**
 * Write a DataTable to a specific format.
 *
 * @param dataTable - The DataTable to write
 * @param format - The output format
 * @param options - Write options
 * @returns ArrayBuffer containing the output data
 *
 * @example
 * ```typescript
 * // Write to PLY format
 * const buffer = await write(dataTable, 'ply');
 *
 * // Write to SOG format with GPU acceleration
 * const buffer = await write(dataTable, 'sog', { useGpu: true });
 * ```
 */
export async function write(
    dataTable: DataTable,
    format: OutputFormat,
    options: WriteOptions = {}
): Promise<ArrayBuffer> {
    const sink = new BufferSink();

    try {
        await writeToSink(sink, dataTable, format, options);
        return await sink.close();
    } finally {
        // Cleanup handled internally by writeSog
    }
}

/**
 * Convert a splat file from one format to another.
 *
 * @param input - The input data (ArrayBuffer, File, or Blob)
 * @param options - Conversion options including transforms and filters
 * @returns ArrayBuffer containing the converted data
 *
 * @example
 * ```typescript
 * // Simple conversion
 * const plyBuffer = await convert(splatFile, {
 *     outputFormat: 'ply'
 * });
 *
 * // Conversion with transforms and filters
 * const sogBuffer = await convert(splatFile, {
 *     outputFormat: 'sog',
 *     transforms: [
 *         { type: 'scale', factor: 2.0 },
 *         { type: 'translate', x: 0, y: 1, z: 0 }
 *     ],
 *     filters: [
 *         { type: 'nan' },
 *         { type: 'box', min: [-10, -10, -10], max: [10, 10, 10] }
 *     ]
 * });
 * ```
 */
export async function convert(
    input: ArrayBuffer | File | Blob,
    options: ConvertOptions
): Promise<ArrayBuffer> {
    // Read input
    const inputFormat = options.inputFormat ?? detectInputFormat(input);
    if (!inputFormat) {
        throw new Error('Could not detect input format. Please specify the inputFormat option.');
    }

    const source = createSource(input);
    let dataTable: DataTable;
    try {
        const tables = await readFromSource(source, inputFormat, options.companionFiles);
        dataTable = combine(tables);
    } finally {
        await source.close();
    }

    // Apply transforms and filters
    const processActions: ProcessAction[] = [];

    if (options.transforms) {
        for (const t of options.transforms) {
            processActions.push(transformToProcessAction(t));
        }
    }

    if (options.filters) {
        for (const f of options.filters) {
            processActions.push(filterToProcessAction(f));
        }
    }

    if (processActions.length > 0) {
        dataTable = processDataTable(dataTable, processActions);
    }

    // Write output
    return write(dataTable, options.outputFormat, options);
}

/**
 * Merge multiple splat files into one.
 *
 * @param inputs - Array of input objects with data and optional transforms
 * @param options - Merge options including output format and filters
 * @returns ArrayBuffer containing the merged data
 *
 * @example
 * ```typescript
 * const mergedBuffer = await merge([
 *     { data: file1 },
 *     { data: file2, transforms: [{ type: 'translate', x: 5, y: 0, z: 0 }] }
 * ], {
 *     outputFormat: 'sog'
 * });
 * ```
 */
export async function merge(
    inputs: MergeInput[],
    options: MergeOptions
): Promise<ArrayBuffer> {
    const dataTables: DataTable[] = [];

    for (const input of inputs) {
        const format = input.format ?? detectInputFormat(input.data);
        if (!format) {
            throw new Error('Could not detect input format. Please specify the format option.');
        }

        const source = createSource(input.data);
        try {
            const tables = await readFromSource(source, format, input.companionFiles);
            let dataTable = combine(tables);

            // Apply per-input transforms
            if (input.transforms && input.transforms.length > 0) {
                const processActions = input.transforms.map(transformToProcessAction);
                dataTable = processDataTable(dataTable, processActions);
            }

            dataTables.push(dataTable);
        } finally {
            await source.close();
        }
    }

    // Combine all tables
    let combined = combine(dataTables);

    // Apply post-merge filters
    if (options.filters && options.filters.length > 0) {
        const processActions = options.filters.map(filterToProcessAction);
        combined = processDataTable(combined, processActions);
    }

    // Write output
    return write(combined, options.outputFormat, options);
}

/**
 * Set the log level for the library.
 * @param quiet - If true, suppress informational messages
 */
export function setQuiet(quiet: boolean): void {
    logger.setQuiet(quiet);
}

// Re-export useful types
export { DataTable, Column };
export type { TypedArray };
