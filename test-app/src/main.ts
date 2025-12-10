/**
 * Test application for @playcanvas/splat-transform browser package
 * This app tests the packaged version loaded from file:../ dependency
 */

import { 
  convert, 
  isGpuAvailable, 
  getGpuAdapters,
  // Encryption APIs
  generateKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  deriveKey,
  isEncrypted,
  // Obfuscated Crypto APIs
  generateSessionToken,
  splitKeyForDelivery,
  createObfuscatedCrypto,
  type ConvertOptions,
  type OutputFormat,
  type ProgressInfo
} from '@playcanvas/splat-transform/browser';

// ============================================================================
// State
// ============================================================================

let selectedFile: File | null = null;
let convertedResult: ArrayBuffer | null = null;
let gpuAvailable = false;
let processingStartTime = 0;

// Encryption state
let currentEncryptionKey: CryptoKey | null = null;
let currentKeyBase64: string | null = null;
let encryptedFileData: ArrayBuffer | null = null;
let decryptedFileData: ArrayBuffer | null = null;
let sessionToken: number = 0;
let currentFragments: string[] = [];

// Stats
let statsEncrypted = 0;
let statsDecrypted = 0;
let statsBytesProtected = 0;

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

// Encryption DOM elements
const encryptionMethod = document.getElementById('encryption-method') as HTMLSelectElement;
const passwordGroup = document.getElementById('password-group') as HTMLDivElement;
const encryptionPassword = document.getElementById('encryption-password') as HTMLInputElement;
const encryptOutput = document.getElementById('encrypt-output') as HTMLInputElement;
const keyDisplayGroup = document.getElementById('key-display-group') as HTMLDivElement;
const generatedKey = document.getElementById('generated-key') as HTMLDivElement;
const copyKeyBtn = document.getElementById('copy-key-btn') as HTMLButtonElement;

// Decrypt DOM elements
const encryptedFileInput = document.getElementById('encrypted-file-input') as HTMLInputElement;
const decryptionMethod = document.getElementById('decryption-method') as HTMLSelectElement;
const decryptKeyGroup = document.getElementById('decrypt-key-group') as HTMLDivElement;
const decryptPasswordGroup = document.getElementById('decrypt-password-group') as HTMLDivElement;
const decryptionKey = document.getElementById('decryption-key') as HTMLInputElement;
const decryptionPassword = document.getElementById('decryption-password') as HTMLInputElement;
const decryptBtn = document.getElementById('decrypt-btn') as HTMLButtonElement;
const decryptResult = document.getElementById('decrypt-result') as HTMLDivElement;
const downloadDecryptedBtn = document.getElementById('download-decrypted-btn') as HTMLButtonElement;

// Obfuscated DOM elements
const sessionTokenInput = document.getElementById('session-token') as HTMLInputElement;
const regenerateTokenBtn = document.getElementById('regenerate-token-btn') as HTMLButtonElement;
const fragmentsGroup = document.getElementById('fragments-group') as HTMLDivElement;
const obfuscatedEncryptBtn = document.getElementById('obfuscated-encrypt-btn') as HTMLButtonElement;
const obfuscatedDecryptBtn = document.getElementById('obfuscated-decrypt-btn') as HTMLButtonElement;

// Stats DOM elements
const statEncrypted = document.getElementById('stat-encrypted') as HTMLElement;
const statDecrypted = document.getElementById('stat-decrypted') as HTMLElement;
const statBytes = document.getElementById('stat-bytes') as HTMLElement;

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
              <strong>Adapter ${i + 1}:</strong> ${adapter.name}
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

    // Initialize encryption UI
    initializeEncryptionUI();

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
      sogIterations: 8,
      onProgress: (info: ProgressInfo) => {
        // Update progress bar with real progress
        updateProgress(info.progress, info.message);
        console.log(`[${info.stage}] ${Math.round(info.progress * 100)}% - ${info.message}`);
      }
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

downloadBtn.addEventListener('click', async () => {
  if (!convertedResult || !selectedFile) return;

  const format = outputFormat.value;
  let dataToDownload: ArrayBuffer = convertedResult;
  let extension = format;

  // If encryption is enabled, encrypt before download
  if (encryptOutput.checked) {
    try {
      const key = await getOrCreateEncryptionKey();
      const encrypted = await encrypt(convertedResult, key);
      dataToDownload = encrypted.data;  // Extract the ArrayBuffer from EncryptedData
      extension = 'e' + format;  // e.g., esog, eply
      
      // Update stats
      statsEncrypted++;
      statsBytesProtected += convertedResult.byteLength;
      updateStats();
      
      console.log('✅ File encrypted before download, size:', dataToDownload.byteLength);
    } catch (err) {
      showError(`Encryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
  }

  const blob = new Blob([dataToDownload], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = selectedFile.name.replace(/\.[^.]+$/, `.${extension}`);
  a.click();
  
  URL.revokeObjectURL(url);
  console.log('File downloaded:', a.download);
});

// ============================================================================
// Encryption Functions
// ============================================================================

function initializeEncryptionUI() {
  // Generate initial session token
  sessionToken = generateSessionToken();
  sessionTokenInput.value = sessionToken.toString();

  // Set up tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      if (!tabId) return;
      
      // Update tab buttons
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabId}`)?.classList.add('active');
    });
  });

  // Encryption method toggle
  encryptionMethod.addEventListener('change', () => {
    if (encryptionMethod.value === 'password') {
      passwordGroup.style.display = 'block';
    } else {
      passwordGroup.style.display = 'none';
    }
  });

  // Copy key button
  copyKeyBtn.addEventListener('click', async () => {
    if (currentKeyBase64) {
      await navigator.clipboard.writeText(currentKeyBase64);
      copyKeyBtn.textContent = '✅ Copied!';
      setTimeout(() => {
        copyKeyBtn.textContent = '📋 Copy Key';
      }, 2000);
    }
  });

  // Decryption method toggle
  decryptionMethod.addEventListener('change', () => {
    if (decryptionMethod.value === 'password') {
      decryptKeyGroup.style.display = 'none';
      decryptPasswordGroup.style.display = 'block';
    } else {
      decryptKeyGroup.style.display = 'block';
      decryptPasswordGroup.style.display = 'none';
    }
  });

  // Decrypt button
  decryptBtn.addEventListener('click', handleDecrypt);

  // Download decrypted button
  downloadDecryptedBtn.addEventListener('click', () => {
    if (!decryptedFileData || !encryptedFileInput.files?.[0]) return;
    
    const blob = new Blob([decryptedFileData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    // Remove the 'e' prefix from encrypted extension
    const originalName = encryptedFileInput.files[0].name.replace(/\.e([^.]+)$/, '.$1');
    a.download = originalName;
    a.click();
    
    URL.revokeObjectURL(url);
  });

  // Regenerate token button
  regenerateTokenBtn.addEventListener('click', () => {
    sessionToken = generateSessionToken();
    sessionTokenInput.value = sessionToken.toString();
    currentFragments = [];
    fragmentsGroup.style.display = 'none';
    obfuscatedDecryptBtn.disabled = true;
    console.log('Session token regenerated');
  });

  // Obfuscated encrypt button
  obfuscatedEncryptBtn.addEventListener('click', handleObfuscatedEncrypt);

  // Obfuscated decrypt button
  obfuscatedDecryptBtn.addEventListener('click', handleObfuscatedDecrypt);
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  if (encryptionMethod.value === 'password') {
    const password = encryptionPassword.value;
    if (!password) {
      throw new Error('Please enter a password');
    }
    // Generate a random salt for this encryption
    const result = await deriveKey(password);
    currentEncryptionKey = result.key;
    currentKeyBase64 = `pwd:${btoa(String.fromCharCode(...result.salt))}`;
    
    keyDisplayGroup.style.display = 'block';
    generatedKey.textContent = '(Password-based - salt saved in file)';
    return currentEncryptionKey;
  }

  // Generate new random key if needed
  if (!currentEncryptionKey) {
    currentEncryptionKey = await generateKey();
    currentKeyBase64 = await exportKey(currentEncryptionKey);
    
    keyDisplayGroup.style.display = 'block';
    generatedKey.textContent = currentKeyBase64;
  }
  
  return currentEncryptionKey!;
}

async function handleDecrypt() {
  const file = encryptedFileInput.files?.[0];
  if (!file) {
    showError('Please select an encrypted file');
    return;
  }

  try {
    const fileData = await file.arrayBuffer();
    
    // Check if it's actually encrypted
    if (!isEncrypted(fileData)) {
      showError('This file does not appear to be encrypted (missing ESPL header)');
      return;
    }

    let key: CryptoKey;
    
    if (decryptionMethod.value === 'password') {
      const password = decryptionPassword.value;
      if (!password) {
        showError('Please enter the password');
        return;
      }
      // For password-based, the salt is in the file
      const salt = new Uint8Array(fileData.slice(20, 36)); // Salt is at bytes 20-36 in header
      const result = await deriveKey(password, { salt });
      key = result.key;
    } else {
      const keyBase64 = decryptionKey.value.trim();
      if (!keyBase64) {
        showError('Please enter the encryption key');
        return;
      }
      key = await importKey(keyBase64);
    }

    decryptedFileData = await decrypt(fileData, key);
    
    // Update stats
    statsDecrypted++;
    updateStats();

    // Show result
    decryptResult.style.display = 'block';
    const decryptedSizeEl = document.getElementById('decrypted-size');
    if (decryptedSizeEl) {
      decryptedSizeEl.textContent = formatBytes(decryptedFileData.byteLength);
    }
    
    console.log('✅ File decrypted successfully');
  } catch (err) {
    showError(`Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

async function handleObfuscatedEncrypt() {
  if (!convertedResult) {
    showError('Please convert a file first');
    return;
  }

  try {
    // Generate a new key
    const key = await generateKey();
    const keyBase64 = await exportKey(key);
    
    // Split key into fragments for delivery
    currentFragments = splitKeyForDelivery(keyBase64);
    
    // Show fragments
    fragmentsGroup.style.display = 'block';
    for (let i = 0; i < 4; i++) {
      const fragEl = document.getElementById(`frag-${i}`);
      if (fragEl) {
        fragEl.textContent = currentFragments[i].substring(0, 8) + '...';
      }
    }
    
    // Encrypt the file
    const encrypted = await encrypt(convertedResult, key);
    encryptedFileData = encrypted.data;  // Extract the ArrayBuffer from EncryptedData
    
    // Update stats
    statsEncrypted++;
    statsBytesProtected += convertedResult.byteLength;
    updateStats();
    
    // Enable decrypt button
    obfuscatedDecryptBtn.disabled = false;
    
    console.log('✅ File encrypted with obfuscated key delivery');
    console.log('Fragments would be delivered via separate API calls');
  } catch (err) {
    showError(`Obfuscated encryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

async function handleObfuscatedDecrypt() {
  if (!encryptedFileData || currentFragments.length !== 4) {
    showError('No encrypted file or missing fragments');
    return;
  }

  try {
    // Create obfuscated crypto instance
    const crypto = createObfuscatedCrypto(sessionToken);
    
    // Feed fragments one by one (simulating separate API responses)
    for (let i = 0; i < 4; i++) {
      crypto.setFragment(i, currentFragments[i]);
      console.log(`Fragment ${i} received from simulated API`);
    }
    
    if (!crypto.isReady()) {
      showError('Not all fragments received');
      return;
    }
    
    // Decrypt
    const decrypted = await crypto.decrypt(encryptedFileData);
    
    // Update stats
    statsDecrypted++;
    updateStats();
    
    // Clean up
    crypto.destroy();
    
    // Download the result
    const blob = new Blob([decrypted], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decrypted.sog';
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log('✅ File decrypted using obfuscated fragments');
  } catch (err) {
    showError(`Obfuscated decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

function updateStats() {
  if (statEncrypted) statEncrypted.textContent = statsEncrypted.toString();
  if (statDecrypted) statDecrypted.textContent = statsDecrypted.toString();
  if (statBytes) statBytes.textContent = formatBytes(statsBytesProtected);
}

// ============================================================================
// UI Helpers
// ============================================================================

function showProgress(message: string) {
  progress.classList.add('active');
  progressText.textContent = message;
  progressFill.style.width = '0%';
}

function updateProgress(progressValue: number, message: string) {
  progress.classList.add('active');
  progressText.textContent = message;
  progressFill.style.width = `${Math.round(progressValue * 100)}%`;
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
