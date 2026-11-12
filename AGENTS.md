# Matrix City App

This repository is public. Keep credentials, OAuth client secrets, deployment
tokens, private source, model weights, game assets without redistribution rights,
and runtime data out of Git and public builds.

Build with Node.js 22+, Clang 18 and wasm-ld. Run `npm run build`, `npm test`,
and `npm run check:public` before publishing. Production deploys through the
GitHub Actions workflow; never copy credentials into the frontend.

The current city preview is a small standalone WASM demo, not the LANParty game.
Port LANParty features deliberately with provenance and permission checks.
OAuth belongs on a separate private VPS backend. No account backend is enabled.

On the development host, use the shared project temporary-storage wrapper named
in the workspace instructions. Keep durable source here and disposable builds,
browser profiles and test output in the designated scratch storage.
