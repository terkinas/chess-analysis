# Vendored Stockfish engine

- Package: [`stockfish`](https://www.npmjs.com/package/stockfish) **19.0.1** (Stockfish.js 19 by Nathan Rugg / Chess.com, built from Stockfish 19)
- Flavor: **lite, single-threaded** (`stockfish-19-lite-single.js` + `.wasm`, ~1.9 MB). No SharedArrayBuffer or COOP/COEP headers needed.
- Source: https://github.com/nmrugg/stockfish.js (npm tarball `stockfish@19.0.1`, `bin/` directory, files copied unmodified)
- License: GPL-3.0 (see `Copying.txt`). Net: nn-61e7af4bb97d (sscg13).

SHA-256:

```
ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a  stockfish-19-lite-single.js
ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de  stockfish-19-lite-single.wasm
```

The `.js` loads the `.wasm` that sits next to it (same name, `.wasm` extension), so keep both files together and
served as `text/javascript` and `application/wasm`. To upgrade: `npm pack stockfish@<version>`, copy the new
`bin/stockfish-<v>-lite-single.{js,wasm}` here, and update `ENGINE_URL` in `app/lib/stockfish-engine.ts`.
