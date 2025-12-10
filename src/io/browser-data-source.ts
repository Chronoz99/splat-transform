/**
 * Browser-compatible data source implementations.
 * These classes work purely with browser APIs and don't require Node.js.
 */

/**
 * Abstract interface for reading data from various sources.
 * Works with browser ArrayBuffer/File/Blob.
 */
interface DataSource {
    /** Total size of the data source in bytes */
    readonly size: number;

    /**
     * Read a chunk of data from the source.
     * @param offset - Starting byte position
     * @param length - Number of bytes to read
     * @returns Promise resolving to the read data
     */
    read(offset: number, length: number): Promise<Uint8Array>;

    /**
     * Read the entire contents of the data source.
     * @returns Promise resolving to all data
     */
    readAll(): Promise<Uint8Array>;

    /**
     * Close the data source and release any resources.
     */
    close(): Promise<void>;
}

/**
 * Browser/universal implementation wrapping an ArrayBuffer or Uint8Array.
 * Works in both Node.js and browser environments.
 */
class BufferSource implements DataSource {
    private data: Uint8Array;

    constructor(data: ArrayBuffer | Uint8Array) {
        this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    get size(): number {
        return this.data.byteLength;
    }

    // eslint-disable-next-line require-await
    async read(offset: number, length: number): Promise<Uint8Array> {
        const end = Math.min(offset + length, this.data.byteLength);
        return this.data.subarray(offset, end);
    }

    // eslint-disable-next-line require-await
    async readAll(): Promise<Uint8Array> {
        return this.data;
    }


    async close(): Promise<void> {
        // No-op for buffer source
    }
}

/**
 * Browser implementation wrapping a File or Blob.
 * Uses the File API's slice and arrayBuffer methods.
 */
class BlobSource implements DataSource {
    private blob: Blob;

    constructor(blob: Blob | File) {
        this.blob = blob;
    }

    get size(): number {
        return this.blob.size;
    }

    async read(offset: number, length: number): Promise<Uint8Array> {
        const end = Math.min(offset + length, this.blob.size);
        const slice = this.blob.slice(offset, end);
        const buffer = await slice.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async readAll(): Promise<Uint8Array> {
        const buffer = await this.blob.arrayBuffer();
        return new Uint8Array(buffer);
    }


    async close(): Promise<void> {
        // No-op for blob source
    }
}

/**
 * Create a DataSource from various browser input types.
 * @param input - The input to create a DataSource from
 * @returns A DataSource appropriate for the input type
 */
function createBrowserDataSource(
    input: ArrayBuffer | Uint8Array | Blob | File
): DataSource {
    // Check for Blob/File (browser) - has slice and arrayBuffer methods
    if (typeof (input as Blob).slice === 'function' && typeof (input as Blob).arrayBuffer === 'function') {
        return new BlobSource(input as Blob);
    }

    // ArrayBuffer or Uint8Array
    if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
        return new BufferSource(input);
    }

    throw new Error('Unsupported input type for DataSource');
}

export {
    DataSource,
    BufferSource,
    BlobSource,
    createBrowserDataSource
};
