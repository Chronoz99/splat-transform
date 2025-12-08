/**
 * Browser GPU implementation using native WebGPU (navigator.gpu)
 */

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

import { GpuDevice, Application } from './gpu-device';
import type { GpuFactory, GpuAdapterInfo } from './gpu-factory';
import { logger } from '../logger';

/**
 * Check if WebGPU is available in the browser
 * @returns True if WebGPU is available
 */
const isAvailable = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
        return false;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        return adapter !== null;
    } catch {
        return false;
    }
};

/**
 * Enumerate available GPU adapters in the browser
 * Note: Browser WebGPU API doesn't expose multiple adapters like Dawn does,
 * so we return a single adapter representing the default GPU
 * @returns Array of available GPU adapters
 */
const enumerateAdapters = async (): Promise<GpuAdapterInfo[]> => {
    if (!await isAvailable()) {
        return [];
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return [];
        }

        // Get adapter info if available
        let name = 'Default GPU';
        if ('info' in adapter) {
            const info = (adapter as any).info;
            if (info && info.device) {
                name = info.device;
            } else if (info && info.description) {
                name = info.description;
            }
        }

        return [{ index: 0, name }];
    } catch {
        return [];
    }
};

/**
 * Create a GPU device in the browser
 * @param adapterName - Ignored in browser (only one adapter available)
 * @returns GPU device instance
 */
const createDevice = async (adapterName?: string): Promise<GpuDevice> => {
    if (!navigator.gpu) {
        throw new Error('WebGPU is not available in this browser');
    }

    // Create an offscreen canvas for the graphics device
    let canvas: HTMLCanvasElement | OffscreenCanvas;

    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(1024, 512);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
    }

    const graphicsDevice = new WebgpuGraphicsDevice(canvas as HTMLCanvasElement, {
        antialias: false,
        depth: false,
        stencil: false
    });

    await graphicsDevice.createDevice();

    // Log GPU info
    logger.info(`Using GPU: ${adapterName || 'browser default'}`);

    // Create the application
    const app = new Application(canvas as HTMLCanvasElement, { graphicsDevice });

    // Create external backbuffer
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

/**
 * Browser GPU factory implementation using native WebGPU
 */
export const browserGpuFactory: GpuFactory = {
    isAvailable,
    enumerateAdapters,
    createDevice
};

// Also export individual functions
export { createDevice, enumerateAdapters, isAvailable };
