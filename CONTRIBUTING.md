# Contributing to Meka Agent

We welcome contributions to Meka Agent! If you'd like to contribute, please follow these guidelines.

## Getting Started

1. Fork the repository and clone it to your local machine.
2. Install the dependencies by running `pnpm install`.
3. Copy `.env.example` to `.env` and fill it up accordingly
4. Create a new branch for your changes.

## Making Changes

1. Make your changes in your branch.
2. Use `pnpm dev` to start a watch build for the packages on your local
3. Run against `pnpm example ./examples/src/SCRIPT_NAME.ts` (SCRIPT_NAME = `openai-simple`, `anthropic-simple`, etc.) to test your changes
4. Run `pnpm lint`, `pnpm format` and `pnpm typecheck` to make sure your changes pass the linting and type-checking rules.
5. Commit your changes and push them to your fork.
6. Open a pull request to the `main` branch of the Meka Agent repository.
