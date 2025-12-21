import { open } from 'node:fs/promises';

import { DataTable } from './data-table/data-table';
import { NodeFileSource } from './io/data-source';
import { readKsplat } from './readers/read-ksplat';
import { readLcc } from './readers/read-lcc';
import { readMjs } from './readers/read-mjs';
import { readPly } from './readers/read-ply';
import { readSog } from './readers/read-sog';
import { readSplat } from './readers/read-splat';
import { readSpz } from './readers/read-spz';
import { Options, Param } from './types';
import { logger } from './utils/logger';

type InputFormat = 'mjs' | 'ksplat' | 'splat' | 'sog' | 'ply' | 'spz' | 'lcc';

const getInputFormat = (filename: string): InputFormat => {
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.endsWith('.mjs')) {
        return 'mjs';
    } else if (lowerFilename.endsWith('.ksplat')) {
        return 'ksplat';
    } else if (lowerFilename.endsWith('.splat')) {
        return 'splat';
    } else if (lowerFilename.endsWith('.sog') || lowerFilename.endsWith('meta.json')) {
        return 'sog';
    } else if (lowerFilename.endsWith('.ply')) {
        return 'ply';
    } else if (lowerFilename.endsWith('.spz')) {
        return 'spz';
    } else if (lowerFilename.endsWith('.lcc')) {
        return 'lcc';
    }

    throw new Error(`Unsupported input file type: ${filename}`);
};

const readFile = async (filename: string, inputFormat: InputFormat, options: Options, params: Param[]): Promise<DataTable[]> => {
    let result: DataTable[];

    logger.info(`reading '${filename}'...`);

    if (inputFormat === 'mjs') {
        result = [await readMjs(filename, params)];
    } else {
        const inputFile = await open(filename, 'r');
        const source = await NodeFileSource.fromFileHandle(inputFile);

        try {
            if (inputFormat === 'ksplat') {
                result = [await readKsplat(source)];
            } else if (inputFormat === 'splat') {
                result = [await readSplat(source)];
            } else if (inputFormat === 'sog') {
                result = [await readSog(source, { sourcePath: filename })];
            } else if (inputFormat === 'ply') {
                result = [await readPly(source)];
            } else if (inputFormat === 'spz') {
                result = [await readSpz(source)];
            } else if (inputFormat === 'lcc') {
                result = await readLcc(source, { ...options, sourcePath: filename });
            }
        } finally {
            await source.close();
        }
    }

    return result;
};

export { readFile, getInputFormat, type InputFormat };
