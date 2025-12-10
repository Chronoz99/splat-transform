/**
 * Browser-compatible data sink implementations.
 * These classes work purely with browser APIs and don't require Node.js.
 */

/**
 * Abstract interface for writing data to various destinations.
 * Works with browser ArrayBuffer accumulation.
 */
interface DataSink {
    /**
     * Write data to the sink.
     * @param data - The data to write
     */
    write(data: Uint8Array): Promise<void>;

    /**
     * Close the sink and finalize the output.
     * Returns the accumulated data as ArrayBuffer.
     */
    close(): Promise<ArrayBuffer | void>;
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
 * Create a DataSink for browser use.
 * @param type - 'buffer' for ArrayBuffer accumulation, 'blob' for Blob accumulation
 * @returns A DataSink appropriate for the output type
 */
function createBrowserDataSink(type: 'buffer' | 'blob' = 'buffer'): DataSink {
    if (type === 'blob') {
        return new BlobSink();
    }
    return new BufferSink();
}

export {
    DataSink,
    BufferSink,
    BlobSink,
    createBrowserDataSink
};
