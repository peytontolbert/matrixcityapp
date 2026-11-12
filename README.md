# Matrix City App

A small public foundation for Matrix City: a static browser frontend with a real,
standalone C-to-WebAssembly city generator. No frontend dependencies, account
backend, private game assets or LANParty source are bundled.

## Run

Install Node.js 22+, Clang 18 and lld 18. On Ubuntu:

```sh
sudo apt-get install clang-18 lld-18
npm run build
npm test
npm run check:public
npm run dev
```

Open `http://localhost:4174`. `CLANG` can override the compiler executable.
`MATRIXCITY_BUILD_DIR` can place build output in project scratch storage; use the
same setting for build, tests and preview. The preview server serves only that
output directory, not the repository. `HOST` and `PORT` configure preview binding.

## Layout

- `native/`: small deterministic WASM core with a versioned exported ABI.
- `web/`: static HTML, CSS and browser rendering.
- `scripts/`: build, source privacy check and preview server.
- `tests/`: actual compiled WASM behavior and hosting configuration checks.
- `.github/workflows/`: CI and Azure production publication.

## Azure deployment

The Azure Static Web App is connected to this repository. The active workflow is
`.github/workflows/azure-static-web-apps-ambitious-stone-0d3c53a0f.yml`.
It installs Clang 18 and lld, builds the frontend and WASM, runs the tests, and
deploys the resulting `dist/` directory using the existing Azure GitHub secret
and GitHub deployment identity. Only the production deployment job can request
an identity token; pull-request builds have read-only repository permissions.

`dist/` is generated, ignored by Git, and uploaded as a workflow artifact named
`matrixcity-static`. Its absence in the repository is expected. For a local build,
run `npm run build`; CI performs that same build on every push and pull request.

Deployment uses `app_location: dist`, `output_location: ''`, and
`skip_app_build: true` because compilation has already finished before the Azure
upload action. Only `main` publishes to production. Pull requests run the build
and checks without deploying. A missing deployment secret fails publication.

The public domain is **matrixgames.app**; the repository remains `matrixcityapp`.
Domain and DNS setup are managed separately in Azure. See
[Azure custom domains](https://learn.microsoft.com/azure/static-web-apps/custom-domain).

## Future integrations

LANParty functionality is not ported yet. Add features in isolated modules with
license and public-source checks. Keep generated/private assets outside this repo.

Google OAuth will run on a separate private VPS API, following the existing
platform architecture. Keep the Google client secret, session keys, database and
tunnel credentials exclusively on the VPS. Register the final production and
localhost callback URLs when enabling it; use state, PKCE, secure HttpOnly cookies,
exact allowed origins and rate limits. The static site currently has no login
button, callback handler or active API configuration. Do not add a public API URL
until its backend and callback behavior are implemented and tested.

This city preview is illustrative geometry, not the existing Matrix City game.
