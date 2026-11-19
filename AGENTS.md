# Working on ink-landscape

- This is an independent TypeScript library. Keep the data/geometry core usable without a browser or Canvas.
- Canvas 2D is the initial backend. Shader support is planned, not implemented or required.
- Preserve composable, editable stroke data. Let callers supply their own paths, regions and direction fields.
- Traditional technique names describe procedural approximations until visual comparison establishes their scope.
- Fixed inputs, seeds and absolute time must give repeatable output. Do not use Math.random or wall-clock animation in the drawing core.
- Use npm test and npm run check for relevant changes; validate renderer changes in an actual browser.
- Keep generated screenshots, browser profiles and temporary output under D:/codex-work/tmp/ink-landscape/<task>/; retained evidence belongs under D:/codex-work/archives/ink-landscape/<date>/.
- Do not include private service data, reference screenshots, credentials, or old video-service implementation files in this public project.
- GitHub publishing and npm publishing are separate operations. The initial package is private to prevent accidental npm publication.
