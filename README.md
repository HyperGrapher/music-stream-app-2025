# Music Streaming App
This Turborepo starter is maintained by the Turborepo core team.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `express`: an [Express.js](https://expressjs.com/) app
- `web`: main [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
pnpm build
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo
pnpm dev
```
## Installation

### Prerequisites

- Node.js v18+ (v22+ recomended)
- PostgreSQL database (either local or free Supabase database)
- [pnpm](https://pnpm.io/) for package management (recommended)
- if you are not using `pnpm` replace `pnpm` shell commands with `npm` with proper commands

### Creating database and user

Make sure .env file is set up correctly (place you own params): 
` DATABASE_URL="postgresql://[my_user]:[password]@localhost:5432/[db_name]?schema=[schema_name]" `

Based on the connection string above, adjust parameters and run commands:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE db_name;
CREATE USER my_user WITH PASSWORD 'password';
ALTER USER my_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE db_name TO my_user;
\q #quit command
```

```ts
// middleware.ts
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    const sessionCookie = getSessionCookie(request); // Optionally pass config as the second argument if cookie name or prefix is customized.
    if (!sessionCookie) {
        return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard"],
};

```