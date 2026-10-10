# Auckland Kind Table

A private, family-oriented guide to cafes, pubs, and restaurants around Auckland. It combines a researched venue and menu catalogue with map and dietary filters, favourites, “want to try” lists, and a personal visit diary.

## Run locally

Requires Node.js 22.13 or newer and pnpm 11.25.0 (the version is pinned in `package.json`). From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development server prints its local URL. For checks and a production build, run:

```sh
pnpm lint
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

The venue catalogue and research evidence in `data/` are source content, not a guarantee that menus, prices, opening hours, or dietary options remain current. Check linked sources and confirm details with venues. Personal visits, preferences, and uploaded photos belong to the hosted runtime database and storage; they are not part of this public source snapshot.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests, and manual dispatch. It uses Node 22, pnpm 11.25.0, a frozen lockfile install, lint, tests, TypeScript checking, and a production build. A successful `main` push or manual run on `main` also publishes a downloadable, commit-identified `sites-build` artifact. Pull requests run checks without producing that artifact. The artifact includes a native Sites `.tar.gz` rooted at `dist/`, with the built Worker and client assets, `dist/.openai/hosting.json`, and migrations under `dist/.openai/drizzle/`. SHA-256 and commit sidecars identify the archive. It contains no credentials or runtime database contents.

GitHub Actions currently does **not** publish this app to the live Sites host. Sites authentication is owned by the Sites dispatch/control plane, and this source delivery has no supported durable GitHub Actions credential flow. The build artifact is a deployable package for an authorized Sites publishing path; it does not mean that a live deployment happened. Do not add short-lived Sites credentials to repository secrets or source. ChatGPT sign-in also depends on Sites dispatch. Hosting directly on Cloudflare would require replacing that authentication integration and configuring the corresponding credentials and runtime services; it is not a drop-in deployment change.

## Source and runtime

The app uses Vinext, Vite, and Cloudflare Workers tooling. `.openai/hosting.json` describes the D1 and R2 binding names expected by the Sites host. The host supplies their real resources and dispatch-owned ChatGPT sign-in; local builds use placeholders and do not connect to hosted data. Keep private runtime records and credentials out of GitHub. Third-party notices are retained in `build/` and `vendor/`.
