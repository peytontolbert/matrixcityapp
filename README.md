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

Create an Azure Static Web App using the Free plan and an external deployment
source (Other). Add its deployment token as the GitHub Actions repository secret
`AZURE_STATIC_WEB_APPS_API_TOKEN`. Run the workflow or push to `main`.

The workflow compiles and tests before publishing `dist`. It deliberately reports
a build-only result when the deployment secret is absent. Pull requests validate
the build without deploying untrusted code to production. No token belongs in Git.

After the Azure hostname is assigned, add the intended custom domain in Azure and
apply the exact validation/DNS records provided there. HTTPS must be active before
connecting accounts. See [Azure custom domains](https://learn.microsoft.com/azure/static-web-apps/custom-domain).

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
