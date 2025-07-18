# Basic Monorepo Template

This repo sets up a basic typescript monorepo.

## Structure

This monorepo uses Turborepo and contains the following structure:

- `apps`: Contains the applications (e.g., `web`, `docs`).
- `packages`: Contains shared packages used across applications (e.g., `ui`, `config`, `db`).

## Environment Variables

Environment variables are managed using `pnpm`. There's 3 layers to it:

```bash
.env.production // used for production builds
.env // used in local development and preview builds
.env.local // used in local development
```

 To set an environment variable, use:

```bash
pnpm env:set <VARIABLE_NAME> <VALUE>
```

This command updates the `.env` file in the root by default.

Use the `-f` flag to target a specific file, for e.g. `.env.local`or `.env.production` :

```bash
pnpm env:set <VARIABLE_NAME> <VALUE> -f .env.local
```

The `.env.local` file is ignored by Git and allows you to have local-specific settings.

The values in all `.env` files are encrypted by default so it can be easily shared across teams. Refer to the [dotenvx](https://dotenvx.com/) documentation for more.

## Database

This project uses PostgreSQL as its database. A Docker Compose setup is provided for easy local development when you run `pnpm dev`

## Development

You'll need Docker to be running.

Run `pnpm dev` to start up the frontend and server.

Finally visit `https://localhost:6969` to see your dev
 server

### First time set-up

If this is your first time setting things up, you'll have to do a few extra things:

1. Run `docker compose up -d` to launch the postgres DB.
2. Run `pnpm db:push` to update the db with the default schema
3. Run `pnpm dev`. Note you might have to accept some certs since we use the `mkcert` vite plugin to develop on `https` by default.

### Adding new package

To add a new package to the monorepo, run:

```bash
pnpm new:package
```

This command will walk you through the process of scaffolding a new package directory under `packages/`with the necessary basic configuration files.

## Building

To build the applications for production, run:

```bash
pnpm build:production
```

To build and preview the applications, run:

```bash
pnpm build:preview
```

The main difference is that `pnpm build:production` uses the `.env.production` file while `build:preview` uses the `.env` file.

## Credits

This repository was originally inspired by via [create t3 turbo](https://github.com/t3-oss/create-t3-turbo) and wouldn't be possible without all the other open source tooling.
