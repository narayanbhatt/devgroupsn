# DEV Group app

Android app for DEV Group customers and staff: catalogue, multi-product enquiries, quotations, approval, manual payment proof, order tracking, documents and chat. Staff screens live in the same app and unlock only for accounts with a server-side staff role. The app is released on Google Play.

The full plan (stack, data model, screens, phases) is in the project's "Digitell Android App: End-to-End Plan" doc.

## Layout

```text
apps/mobile/            Expo (React Native + TypeScript) Android app
  src/app/              Screens (Expo Router: each file is a route)
  src/components/       Shared UI
  src/data/             Data access (Supabase, with sample data when not configured)
  src/lib/              Supabase client, helpers
  src/theme/            Design tokens (navy, orange, type scale, spacing)
supabase/
  migrations/           Database schema and access rules (row-level security)
  seed.sql              The real DEV catalogue
  tests/                Access-rule tests, run on plain Postgres
.github/workflows/      CI: lint, typecheck, unit tests, database tests, test APK
```

## Run the app

Requirements: Node 22, and an Android phone with a development build or an emulator.

```bash
cd apps/mobile
npm install
cp .env.example .env    # optional: add the Supabase URL and anon key
npx expo run:android    # builds and installs on a connected device or emulator
```

Without a `.env`, the app runs in demo mode with the sample catalogue.

Every CI run on a pull request also builds a test APK (signed with the debug key) that you can download from the run's **Artifacts** section and install on a phone.

## Checks

```bash
cd apps/mobile
npm run lint
npm run typecheck
npm test
```

Database tests need an empty Postgres 15+ database:

```bash
DATABASE_URL=postgresql://postgres@localhost/devtest ./supabase/tests/run.sh
```

## Set up Supabase

1. Create a project at supabase.com (free tier is fine for development).
2. Apply `supabase/migrations/*.sql` then `supabase/seed.sql` (Supabase CLI: `supabase db push`, or paste into the SQL editor in order).
3. Put the project URL and **anon** key in `apps/mobile/.env`, and as GitHub Actions secrets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for CI builds.
4. Make the first super admin from the SQL editor: `insert into public.staff_roles (user_id, role) values ('<user id>', 'super_admin');`

Never put the `service_role` key in the app or in this repository.
