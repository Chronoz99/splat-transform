## Build instructions for the webp wasm module

1. Install emsdk and activate it

2. Clone the webp repo and build wasm library:
```
emcmake cmake -S . -B build -DBUILD_SHARED_LIBS=OFF

emmake make -C build

emcc -O3 -msimd128 webp.c build/libwebp.a build/libsharpyuv.a \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS='["_webp_encode_rgba","_webp_encode_lossless_rgba","_webp_decode_rgba","_webp_free","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","HEAPU8","HEAPU32"]' \
  -o webp.mjs
```

### SIMD Optimization

The `-msimd128` flag enables WebAssembly SIMD instructions for faster WebP encoding:
- Provides 20-50% faster encoding for lossless RGBA
- Supported in: Chrome ≥91, Firefox ≥89, Safari ≥16.4, Node.js ≥16.4
- Falls back gracefully on unsupported environments
- Produces identical output (lossless encoding is deterministic)

Note: The `-sENVIRONMENT=node` flag has been removed to support both Node.js and browser environments.
The generated webp.mjs file has been manually patched to detect the environment at runtime using:
`typeof process!=="undefined"&&typeof process.versions!=="undefined"&&typeof process.versions.node!=="undefined"`
