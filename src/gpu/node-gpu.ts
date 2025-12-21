/**
 * Node.js GPU implementation using Dawn (webgpu npm package)
 */

import { Worker } from 'node:worker_threads';

import {
    // components
    AnimComponentSystem,
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    GSplatComponentSystem,
    ScriptComponentSystem,
    // handlers
    AnimClipHandler,
    AnimStateGraphHandler,
    BinaryHandler,
    ContainerHandler,
    CubemapHandler,
    GSplatHandler,
    RenderHandler,
    TextureHandler,
    // rest
    PIXELFORMAT_BGRA8,
    Texture,
    WebgpuGraphicsDevice
} from 'playcanvas';
import { create, globals } from 'webgpu';

import { GpuDevice, Application } from './gpu-device';
import type { GpuFactory, GpuAdapterInfo } from './gpu-factory';
import { logger } from '../utils/logger';

const initializeGlobals = () => {
    Object.assign(globalThis, globals);

    // window stub
    (globalThis as any).window = {
        navigator: { userAgent: 'node.js' }
    };

    // document stub
    (globalThis as any).document = {
        createElement: (type: string) => {
            if (type === 'canvas') {
                return {
                    getContext: (): null => {
                        return null;
                    },
                    getBoundingClientRect: () => {
                        return {
                            left: 0,
                            top: 0,
                            width: 300,
                            height: 150,
                            right: 300,
                            bottom: 150
                        };
                    },
                    width: 300,
                    height: 150
                };
            }
        }
    };
};

initializeGlobals();

// Get Dawn's actual adapter names by triggering its error message.
// This is the official documented method for enumerating adapters:
// https://github.com/dawn-gpu/node-webgpu?tab=readme-ov-file#usage
const getDawnAdapterNames = async (): Promise<string[]> => {
    try {
        const gpu = create(['adapter=__list_adapters__']);
        await gpu.requestAdapter();
    } catch (e) {
        // Parse Dawn's error message to extract adapter names
        const message = e instanceof Error ? e.message : String(e);
        const lines = message.split('\n');
        const names: string[] = [];

        for (const line of lines) {
            // Look for lines like: " * backend: 'd3d12', name: 'NVIDIA RTX A2000 8GB Laptop GPU'"
            const match = line.match(/name:\s*'([^']+)'/);
            if (match) {
                names.push(match[1]);
            }
        }

        return names;
    }

    // Unexpected: requestAdapter should have thrown with invalid adapter name
    logger.warn('Expected adapter enumeration to throw an error, but it did not.');
    return [];
};

// Cache enumerated adapters so we don't query Dawn multiple times
let cachedAdapters: GpuAdapterInfo[] | null = null;

const enumerateAdapters = async (): Promise<GpuAdapterInfo[]> => {
    if (cachedAdapters) {
        return cachedAdapters;
    }

    try {
        logger.info('Detecting GPU adapters...');

        // Get the actual adapter names directly from Dawn
        const dawnAdapterNames = await getDawnAdapterNames();

        // Cache and return the list
        cachedAdapters = dawnAdapterNames.map((name, index) => ({
            index,
            name
        }));

        return cachedAdapters;
    } catch (e) {
        logger.error('Failed to enumerate adapters. Error:', e);
        logger.error('\nThis usually means WebGPU is not available. Please ensure:');
        logger.error('  - Your GPU drivers are up to date');
        logger.error('  - Your GPU supports Vulkan, D3D12, or Metal');
        return [];
    }
};

const createDevice = async (adapterName?: string): Promise<GpuDevice> => {
    // Use Dawn's adapter selection if a specific adapter name is provided
    const dawnOptions = adapterName ? [`adapter=${adapterName}`] : [];

    // @ts-ignore
    window.navigator.gpu = create(dawnOptions);

    const canvas = document.createElement('canvas');

    canvas.width = 1024;
    canvas.height = 512;

    const graphicsDevice = new WebgpuGraphicsDevice(canvas, {
        antialias: false,
        depth: false,
        stencil: false
    });

    await graphicsDevice.createDevice();

    // print gpu info
    logger.info(`Using GPU: ${adapterName || 'auto'}`);

    // create the application
    const app = new Application(canvas, { graphicsDevice });

    // create external backbuffer
    const backbuffer = new Texture(graphicsDevice, {
        width: 1024,
        height: 512,
        name: 'WebgpuInternalBackbuffer',
        mipmaps: false,
        format: PIXELFORMAT_BGRA8
    });

    // @ts-ignore
    graphicsDevice.externalBackbuffer = backbuffer;

    return new GpuDevice(app, backbuffer);
};

const isAvailable = async (): Promise<boolean> => {
    try {
        const adapters = await enumerateAdapters();
        return adapters.length > 0;
    } catch {
        return false;
    }
};

/**
 * Node.js GPU factory implementation using Dawn
 */
export const nodeGpuFactory: GpuFactory = {
    isAvailable,
    enumerateAdapters,
    createDevice
};

// Also export individual functions for backward compatibility
export { createDevice, enumerateAdapters, isAvailable };
