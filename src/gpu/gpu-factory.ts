/**
 * GPU Factory - Abstract factory for creating GPU devices
 *
 * This module provides a platform-agnostic way to create GPU devices.
 * - In Node.js: Uses the 'webgpu' npm package (Dawn)
 * - In Browser: Uses native navigator.gpu
 */

import type { GpuDevice } from './gpu-device';

/**
 * GPU adapter information
 */
export interface GpuAdapterInfo {
    index: number;
    name: string;
}

/**
 * GPU Factory interface for creating devices
 */
export interface GpuFactory {
    /**
     * Check if WebGPU is available on this platform
     */
    isAvailable(): Promise<boolean>;

    /**
     * Enumerate available GPU adapters
     */
    enumerateAdapters(): Promise<GpuAdapterInfo[]>;

    /**
     * Create a GPU device
     * @param adapterName - Optional adapter name to use
     */
    createDevice(adapterName?: string): Promise<GpuDevice>;
}

// Environment detection
const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

/**
 * Get the appropriate GPU factory for the current environment
 * @returns GPU factory for the current platform, or null if unavailable
 */
export function getGpuFactory(): Promise<GpuFactory | null> {
    if (isBrowser) {
        return getBrowserGpuFactory();
    }
    return getNodeGpuFactory();
}

/**
 * Check if GPU is available in the current environment
 * @returns True if GPU is available
 */
export async function isGpuAvailable(): Promise<boolean> {
    const factory = await getGpuFactory();
    if (!factory) return false;
    return factory.isAvailable();
}

/**
 * Enumerate available GPU adapters
 * @returns Array of available GPU adapters
 */
export async function enumerateGpuAdapters(): Promise<GpuAdapterInfo[]> {
    const factory = await getGpuFactory();
    if (!factory) return [];
    return factory.enumerateAdapters();
}

/**
 * Create a GPU device using the appropriate factory
 * @param adapterName - Optional adapter name to use
 * @returns GPU device instance, or null if unavailable
 */
export async function createGpuDevice(adapterName?: string): Promise<GpuDevice | null> {
    const factory = await getGpuFactory();
    if (!factory) return null;

    const available = await factory.isAvailable();
    if (!available) return null;

    try {
        return await factory.createDevice(adapterName);
    } catch {
        return null;
    }
}

/**
 * Get the Node.js GPU factory
 * @returns Node.js GPU factory, or null if unavailable
 */
async function getNodeGpuFactory(): Promise<GpuFactory | null> {
    try {
        // Dynamic import to avoid bundling Node-specific code in browser builds
        const nodeGpu = await import('./node-gpu.js');
        return nodeGpu.nodeGpuFactory;
    } catch {
        return null;
    }
}

/**
 * Get the browser GPU factory
 * @returns Browser GPU factory, or null if unavailable
 */
async function getBrowserGpuFactory(): Promise<GpuFactory | null> {
    try {
        // Dynamic import for browser GPU module
        const browserGpu = await import('./browser-gpu.js');
        return browserGpu.browserGpuFactory;
    } catch {
        return null;
    }
}
