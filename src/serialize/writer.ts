import { FileHandle } from 'node:fs/promises';

import { DataSink, NodeFileSink, BufferSink } from '../io/data-sink';

// defines the interface for a stream writer class. all functions are async.
// Re-export DataSink as Writer for backward compatibility
type Writer = DataSink;

// write data to a file stream
// Re-export NodeFileSink as FileWriter for backward compatibility
class FileWriter extends NodeFileSink {}

// Buffer writer for in-memory output (browser/testing)
class MemoryWriter extends BufferSink {}

export { Writer, FileWriter, MemoryWriter };
