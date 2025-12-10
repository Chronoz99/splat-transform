/**
 * I/O abstraction layer for cross-platform compatibility.
 * Provides unified interfaces for reading and writing data
 * that work in both Node.js and browser environments.
 */

export {
    DataSource,
    NodeFileSource,
    BufferSource,
    BlobSource,
    createDataSource
} from './data-source';

export {
    DataSink,
    NodeFileSink,
    BufferSink,
    BlobSink,
    createDataSink
} from './data-sink';
