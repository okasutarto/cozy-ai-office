# Contributing Guidelines

We welcome contributions to Cozy Agent Office! Please adhere to the guidelines below to maintain security, performance, and license compliance:

## Development Environment Setup

1. **Prerequisites**:
   - Node.js 24 LTS or later.
   - Git.
   - Recommended: [NVM](https://github.com/nvm-sh/nvm) (uses `.nvmrc`).

2. **Installation**:

   ```bash
   npm ci
   ```

3. **Running Dev Servers**:
   ```bash
   npm run dev
   ```

## Development & Code Quality Checks

Before making a pull request, verify that all quality gates pass:

- **Formatting**: `npm run format:check`
- **Asset Integrity**: `npm run assets:check`
- **TypeScript**: `npm run typecheck`
- **Unit & Integration Tests**: `npm run test`
- **E2E Tests**: `npm run test:e2e`

## Art Asset Contributions

- All sprites, animations, tilesets, and assets must be original. Do not copy assets from existing pixel art games, proprietary works, or commercial packages.
- All contributions must be licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) and documented in `public/assets/licenses.json`.
- Run `npm run assets:generate` to regenerate asset atlases after adding new art files.
