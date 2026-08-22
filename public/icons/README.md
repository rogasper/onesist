# Third-Party Icon Packs

This folder stores source-traceable third-party icon packs for local-first use.

Rules:
1. Every provider folder must contain `SOURCE.md`.
2. Keep original downloads in `raw/`.
3. Keep optimized app assets in `processed/`.
4. Do not add assets without terms verification.

## Runtime integration

- Keep provider packs behind `VITE_SHAPE_LIBRARY_V1=1` until import, search, and rendering paths are validated.
- Prefer manifest-backed lazy loading over adding large SVG collections to the default icon bundle.
- Store provider selections by stable ids (`archIconPackId`, `archIconShapeId`) instead of embedding SVG markup on nodes.
- Keep runtime JS metadata path-derived and lazy-resolve concrete SVG asset URLs per visible tile or selected node.
- Search UIs should cap visible results and rely on filtering for large packs.

## Current rollout status

- `aws`: local SVG pack wired into the app as a lazy-loaded provider asset pack.
- `azure`: official Microsoft SVG pack imported locally and available in the asset browser.
- `cncf`: official CNCF project icon SVGs imported locally and available in the asset browser.
- `google-cloud`: blocked for production bundling until redistribution terms are explicitly confirmed.
