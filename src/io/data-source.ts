import { Buffer } from 'node:buffer';
import { FileHandle } from 'node:fs/promises';

/**
 * Abstract interface for reading data from various sources.
 * Works with both Node.js FileHandle and browser ArrayBuffer/File/Blob.
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
 * Node.js implementation wrapping a FileHandle.
 */
class NodeFileSource implements DataSource {
    private fileHandle: FileHandle;
    private _size: number;

    constructor(fileHandle: FileHandle, size: number) {
        this.fileHandle = fileHandle;
        this._size = size;
    }

    get size(): number {
        return this._size;
    }

    /**
     * Create a NodeFileSource from a FileHandle.
     * Will stat the file to get its size.
     * @param fileHandle - The file handle to wrap
     * @returns A new NodeFileSource instance
     */
    static async fromFileHandle(fileHandle: FileHandle): Promise<NodeFileSource> {
        const stats = await fileHandle.stat();
        return new NodeFileSource(fileHandle, stats.size);
    }

    async read(offset: number, length: number): Promise<Uint8Array> {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await this.fileHandle.read(buffer, 0, length, offset);
        if (bytesRead !== length) {
            // Return only the bytes that were read
            return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
        }
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    // eslint-disable-next-line require-await
    async readAll(): Promise<Uint8Array> {
        return this.read(0, this._size);
    }

    async close(): Promise<void> {
        await this.fileHandle.close();
    }
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
 * Create a DataSource from various input types.
 * Automatically detects the input type and returns the appropriate implementation.
 * @param input - The input to create a DataSource from
 * @returns A DataSource appropriate for the input type
 */
// eslint-disable-next-line require-await
async function createDataSource(
    input: FileHandle | ArrayBuffer | Uint8Array | Blob | File
): Promise<DataSource> {
    // Check for FileHandle (Node.js) - has read and stat methods
    if (typeof (input as FileHandle).stat === 'function' && typeof (input as FileHandle).read === 'function') {
        return NodeFileSource.fromFileHandle(input as FileHandle);
    }

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
    NodeFileSource,
    BufferSource,
    BlobSource,
    createDataSource
};
