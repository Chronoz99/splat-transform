/**
 * Test application for @playcanvas/splat-transform browser package
 * This app tests the packaged version loaded from file:../ dependency
 */

import { 
  convert, 
  isGpuAvailable, 
  getGpuAdapters, 
  type ConvertOptions,
  type OutputFormat 
} from '@playcanvas/splat-transform/browser';

// ============================================================================
// State
// ============================================================================

let selectedFile: File | null = null;
let convertedResult: ArrayBuffer | null = null;
let gpuAvailable = false;
let processingStartTime = 0;

// ============================================================================
// DOM Elements
// ============================================================================

const fileInput = document.getElementById('file-input') as HTMLInputElement;
const convertBtn = document.getElementById('convert-btn') as HTMLButtonElement;
const outputFormat = document.getElementById('output-format') as HTMLSelectElement;
const progress = document.getElementById('progress') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLDivElement;
const result = document.getElementById('result') as HTMLDivElement;
const error = document.getElementById('error') as HTMLDivElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;

const packageStatus = document.getElementById('package-status') as HTMLSpanElement;
const gpuStatus = document.getElementById('gpu-status') as HTMLSpanElement;
const browserInfo = document.getElementById('browser-info') as HTMLSpanElement;
const gpuAdaptersDiv = document.getElementById('gpu-adapters') as HTMLDivElement;

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
  try {
    // Show browser info
    browserInfo.textContent = navigator.userAgent.split(/[()]/)[1] || 'Unknown';

    // Check GPU availability
    gpuAvailable = await isGpuAvailable();
    
    if (gpuAvailable) {
      gpuStatus.innerHTML = '<span class="status-badge badge-success">Available ✓</span>';
      
      // Get GPU adapters
      try {
        const adapters = await getGpuAdapters();
        if (adapters.length > 0) {
          gpuAdaptersDiv.style.display = 'block';
          gpuAdaptersDiv.innerHTML = '<strong>Available GPU Adapters:</strong>';
          adapters.forEach((adapter, i) => {
            const adapterDiv = document.createElement('div');
            adapterDiv.className = 'gpu-adapter';
            adapterDiv.innerHTML = `
              <strong>Adapter ${i + 1}:</strong> ${adapter.name}<br>
              <strong>Vendor:</strong> ${adapter.vendor}
            `;
            gpuAdaptersDiv.appendChild(adapterDiv);
          });
        }
      } catch (err) {
        console.warn('Could not enumerate GPU adapters:', err);
      }
    } else {
      gpuStatus.innerHTML = '<span class="status-badge badge-warning">Not Available</span>';
    }

    // Package loaded successfully
    packageStatus.innerHTML = '<span class="status-badge badge-success">Loaded ✓</span>';

    console.log('✅ Package initialized successfully');
    console.log('WebGPU available:', gpuAvailable);
  } catch (err) {
    console.error('Failed to initialize package:', err);
    packageStatus.innerHTML = '<span class="status-badge badge-error">Failed ✗</span>';
    showError(`Initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

fileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file) {
    selectedFile = file;
    convertBtn.disabled = false;
    hideError();
    hideResult();
    console.log('File selected:', file.name, `(${formatBytes(file.size)})`);
  }
});

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  try {
    convertBtn.disabled = true;
    hideError();
    hideResult();
    showProgress('Starting conversion...');

    const format = outputFormat.value as OutputFormat;
    processingStartTime = Date.now();

    console.log('Converting', selectedFile.name, 'to', format);

    const options: ConvertOptions = {
      outputFormat: format,
      useGpu: gpuAvailable && format === 'sog',
      sogIterations: 8
    };

    // Convert the file
    const result = await convert(selectedFile, options);
    
    const processingTime = Date.now() - processingStartTime;
    convertedResult = result;

    // Show results
    hideProgress();
    showResult(selectedFile.size, result.byteLength, processingTime);

    console.log('✅ Conversion complete:', formatBytes(result.byteLength), 'in', processingTime, 'ms');
  } catch (err) {
    console.error('Conversion failed:', err);
    hideProgress();
    showError(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    convertBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!convertedResult || !selectedFile) return;

  const format = outputFormat.value;
  const blob = new Blob([convertedResult], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = selectedFile.name.replace(/\.[^.]+$/, `.${format}`);
  a.click();
  
  URL.revokeObjectURL(url);
  console.log('File downloaded:', a.download);
});

// ============================================================================
// UI Helpers
// ============================================================================

function showProgress(message: string) {
  progress.classList.add('active');
  progressText.textContent = message;
  progressFill.style.width = '0%';
  
  // Simulate progress (since we don't have real progress callbacks yet)
  let width = 0;
  const interval = setInterval(() => {
    width += 1;
    if (width >= 90) {
      clearInterval(interval);
    }
    progressFill.style.width = `${width}%`;
  }, 100);
}

function hideProgress() {
  progress.classList.remove('active');
  progressFill.style.width = '0%';
}

function showResult(inputSize: number, outputSize: number, time: number) {
  result.classList.add('active');
  
  const outputSizeEl = document.getElementById('output-size');
  const processingTimeEl = document.getElementById('processing-time');
  const compressionRatioEl = document.getElementById('compression-ratio');
  
  if (outputSizeEl) outputSizeEl.textContent = formatBytes(outputSize);
  if (processingTimeEl) processingTimeEl.textContent = `${(time / 1000).toFixed(2)}s`;
  
  if (compressionRatioEl) {
    const ratio = ((1 - outputSize / inputSize) * 100).toFixed(1);
    compressionRatioEl.textContent = `${ratio}% smaller`;
  }
}

function hideResult() {
  result.classList.remove('active');
  convertedResult = null;
}

function showError(message: string) {
  error.classList.add('active');
  error.textContent = `❌ ${message}`;
}

function hideError() {
  error.classList.remove('active');
  error.textContent = '';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================================================
// Start the app
// ============================================================================

initialize();
