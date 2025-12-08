import { FileHandle } from 'node:fs/promises';

/**
 * Abstract interface for writing data to various destinations.
 * Works with both Node.js FileHandle and browser ArrayBuffer accumulation.
 */
interface DataSink {
    /**
     * Write data to the sink.
     * @param data - The data to write
     */
    write(data: Uint8Array): Promise<void>;

    /**
     * Close the sink and finalize the output.
     * For buffer-based sinks, returns the accumulated data.
     * For file-based sinks, returns void after flushing.
     */
    close(): Promise<ArrayBuffer | void>;
}

/**
 * Node.js implementation wrapping a FileHandle for writing.
 */
class NodeFileSink implements DataSink {
    private fileHandle: FileHandle;
    private cursor: number = 0;

    constructor(fileHandle: FileHandle) {
        this.fileHandle = fileHandle;
    }

    async write(data: Uint8Array): Promise<void> {
        await this.fileHandle.write(data);
        this.cursor += data.byteLength;
    }

    async close(): Promise<void> {
        await this.fileHandle.truncate(this.cursor);
    }
}

/**
 * Browser/universal implementation that accumulates data into an ArrayBuffer.
 * Works in both Node.js and browser environments.
 */
class BufferSink implements DataSink {
    private chunks: Uint8Array[] = [];
    private totalLength: number = 0;

    // eslint-disable-next-line require-await
    async write(data: Uint8Array): Promise<void> {
        // Make a copy to avoid issues with reused buffers
        const copy = new Uint8Array(data);
        this.chunks.push(copy);
        this.totalLength += copy.byteLength;
    }

    // eslint-disable-next-line require-await
    async close(): Promise<ArrayBuffer> {
        // Combine all chunks into a single ArrayBuffer
        const result = new Uint8Array(this.totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        // Clear chunks to free memory
        this.chunks = [];
        return result.buffer;
    }
}

/**
 * Browser implementation that accumulates data into a Blob.
 * Useful for very large outputs where ArrayBuffer might be inefficient.
 */
class BlobSink implements DataSink {
    private chunks: ArrayBuffer[] = [];
    private mimeType: string;

    constructor(mimeType: string = 'application/octet-stream') {
        this.mimeType = mimeType;
    }

    // eslint-disable-next-line require-await
    async write(data: Uint8Array): Promise<void> {
        // Make a copy to avoid issues with reused buffers
        const copy = data.slice().buffer;
        this.chunks.push(copy);
    }

    // eslint-disable-next-line require-await
    async close(): Promise<ArrayBuffer> {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        // Clear chunks to free memory
        this.chunks = [];
        return blob.arrayBuffer();
    }

    /**
     * Get the result as a Blob instead of ArrayBuffer.
     * Call this instead of close() when you want a Blob.
     * @returns The accumulated data as a Blob
     */
    // eslint-disable-next-line require-await
    async closeAsBlob(): Promise<Blob> {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        // Clear chunks to free memory
        this.chunks = [];
        return blob;
    }
}

/**
 * Create a DataSink for the given output target.
 * @param output - FileHandle for Node.js file output, or 'buffer' for in-memory accumulation
 * @returns A DataSink appropriate for the output type
 */
function createDataSink(output: FileHandle | 'buffer' | 'blob'): DataSink {
    if (output === 'buffer') {
        return new BufferSink();
    }
    if (output === 'blob') {
        return new BlobSink();
    }
    // Assume FileHandle
    return new NodeFileSink(output as FileHandle);
}

export {
    DataSink,
    NodeFileSink,
    BufferSink,
    BlobSink,
    createDataSink
};
