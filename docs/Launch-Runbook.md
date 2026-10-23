# Putting DECA Mark in front of Janet (October 8, 2026)

> Historical October 8 rollout recipe. Do not execute the incremental migration-repair/db-push sequence below against the current baseline. The current schema needs an explicitly approved target/reconciliation plan, as recorded in [the October 14 diagnosis](reviews/ci-and-hosted-data-2026-10-14.md). Use [current position](plan/current-state.md) and [operations](plan/operations.md) for sequencing. Account counts, deployment absence and sender assumptions below are dated evidence.

The steps that turn `master` into something Janet signs in to herself: the hosted database, the API on Render, the web app on Vercel, her account and study, and a collector build on her device. Each step names who does it and how to check it. Hosted changes are never part of an automated task (`AGENTS.md`); every step here is run by a person.

Project: **DECA Mark GIS**, `lezmqhuucfwqknspgcdy` (us-east-1). Checked read-only on October 8: the ledger holds `0001`–`0005`; `auth.users` has one account; no project membership lacks its Auth user; `pg_cron` is available.

## 1. The database (you, about 10 minutes)

The hosted history records the site-packages migration as `20260926200655`; the repository names the same file `20260923120000`. Their contents are byte-identical (MD5 `ae1d6154…`), so the history is repaired, not the schema.

```sh
pnpm dlx supabase@2.118.0 login
pnpm dlx supabase@2.118.0 link --project-ref lezmqhuucfwqknspgcdy
pnpm dlx supabase@2.118.0 migration repair --status reverted 20260926200655
pnpm dlx supabase@2.118.0 migration repair --status applied 20260923120000
pnpm dlx supabase@2.118.0 migration list      # 8 pending: 20260926210844 … 20261007120000
pnpm dlx supabase@2.118.0 db push
```

`db push` applies, in order: default privileges, identity and tenancy, tenancy functions and guards, Training (it creates `pg_cron`'s nightly purge), the sign-up hook function, and sites, forms and round context. Then, optionally, run `database/hosted/verify.sql` in a `psql` session as `postgres` with `-v ON_ERROR_STOP=1`; every assertion rolls back.

Check: `TABLE fieldmaps_meta.schema_migrations;` lists `0001` to `0013`.

## 2. Accounts (you, 5 minutes)

Sign-up stays off, and no email sender is configured, so a code sent by email would not arrive: Supabase's built-in email reaches only the Supabase organization's own members. Until a sender is set up (OPS-02, needs a domain), create accounts by hand:

- **Dashboard → Authentication → Users → Add user → Create new user**, with the email, a temporary password of at least 8 characters, and **Auto Confirm User** ticked. One for you (the organization's owner) and one for Janet.
- Password reset by email needs the sender too. Until then, set a new password from the same page.

## 3. The API on Render (you, 15 minutes)

New **Web Service** from this repository:

| Setting | Value |
| --- | --- |
| Runtime | Docker |
| Branch | `master` |
| Dockerfile path | `backend/Dockerfile` |
| Docker build context | `backend` |
| Region | Virginia (US East), near the database pooler |
| Instance | Starter or larger, so it does not sleep between requests |
| Health check path | `/ready` |
| Environment variable | `DECAMARK_CONFIG=config.render.json` |
| Secret File | `database-password`: the hosted `fieldmaps_api` password, nothing else (`node scripts/api-role-password.mjs` makes a new one) |

The password is in your local volume: `docker run --rm -v fieldmaps_hosted_api_secrets:/s alpine cat /s/database-password`. Account deletion needs a second Secret File, `supabase-secret-key`, and `auth_admin_key_file` in the configuration (BE-08); without it, deleting an account answers "not available yet" and changes nothing.

Check: `curl https://<service>.onrender.com/ready` returns `{"status":"ready"}`, and `curl -o /dev/null -w '%{http_code}' https://<service>.onrender.com/v1/me` returns 401.

If the deploy exits with status 3, the API could not start, and its log has one `startup_failed` line saying why:

- `password authentication failed for user "fieldmaps_api"`: the Secret File is not the role's password, and Supabase's pooler logs say the same. Give the role a new one with `node scripts/api-role-password.mjs`. It prints an `ALTER ROLE` for the Supabase SQL editor and the password for the `database-password` Secret File; paste each, then redeploy. The statement carries only the password's SCRAM verifier, so the password itself never reaches the SQL editor or its history. Run the statement and paste the password from the same run: a second run makes a different pair, and the role keeps whichever statement ran last. Anything else that signs in as `fieldmaps_api` needs the new password too.
- `Tenant or user not found`: the pooler host in `config.render.json` is not this project's. Copy the session pooler host from **Connect** in the Supabase dashboard.
- `must not be superuser or bypass row security`: the configuration names the wrong role.

## 4. The web app on Vercel (you, 5 minutes)

Production environment variables, then redeploy. `NEXT_PUBLIC_` values are compiled into the build, so a running deployment does not pick up a change.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lezmqhuucfwqknspgcdy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (as in `mobile/config/staging.json`) |
| `DECAMARK_API_URL` | `https://field-maps.onrender.com`, no trailing slash. The web server reads and writes the API with it |
| `NEXT_PUBLIC_DECAMARK_API_URL` | the same value. The browser uploads and downloads map packages (up to 24 MiB, more than Vercel passes through) straight to the API with it |
| `NEXT_PUBLIC_ANDROID_APP_URL` | Optional. An https link to the Android build. When it is set, the home page and the collect page show it |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | A secret from `openssl rand -base64 32`, set for Production and Preview and never changed or committed. It keeps the ids of the web's save actions the same across deploys, so a page left open still saves after a deploy (D34, OPS-20) |

The free Vercel plan has no Skew Protection, so during the pilot, deploy the web outside the times managers are editing forms or settings.

In Supabase, **Authentication → URL Configuration**: Site URL `https://decamark.vercel.app`.

The browser calls the API directly, so the API must allow the web domain. In `backend/config.render.json`, `browser_origins` now allows `https://decamark.vercel.app`, `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173` and `http://127.0.0.1:5173`. `browser_origin_pattern` also allows Vercel's per-branch preview hosts: `https://deca-mark-<name>-audit-tools-web-apps-deca-lab-at-cornell.vercel.app`. If production is served from any other domain, add it to `browser_origins` and redeploy the API. Until then, uploading or downloading a map package fails in the browser, and the pages the server renders still load.

Check: sign in at `https://decamark.vercel.app/sign-in` with your account. Before step 5 a new account has no project to show, and `/o` says "You are not in a project yet". After step 5 you land on Play Study, and the header shows your name, email and initials.

## 5. Janet's study (you, 2 minutes)

From the repository, signed in as your own account:

```sh
DECAMARK_API_URL=https://<service>.onrender.com \
SUPABASE_URL=https://lezmqhuucfwqknspgcdy.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable key> \
MANAGER_EMAIL=<your email> \
node scripts/bootstrap-study.mjs --invite <janet's email>:manager --join-code observer:25
```

It creates the DECA Lab organization and the Play Study project, publishes Janet's behaviour-mapping and zone-inventory forms, creates the Fall Creek site with its map package (outline, surfaces, equipment, tree canopies, one zone covering the playground), and prints Janet's invitation code and an observer join code once. Run it again and it changes nothing that exists. `--help` lists the options, including `--package <folder>` for another site's QGIS export (`ground`, `zones`, and optionally `trees` and `paths` as GeoJSON). Zones come only from the export: no zone is drawn that the site's own drawings do not have.

The account that runs the script owns DECA Lab. Owners and admins add more people from **Organization members** (`/o/deca-lab/members`), and project managers add observers and viewers from the project's **Team** tab. An invitation gives a link and a code, shown once. DECA Mark does not send email: copy the link or the code and send it yourself.

## 6. The collector on Janet's device (you)

Set `apiUrl` in `mobile/config/staging.json` to the Render URL, then build the `preview` profile (staging configuration, bundle `com.fieldmaps.collector.dev`):

- **Android**: `eas build --profile preview --platform android` gives an APK link to install directly.
- **iPhone or iPad**: an internal build needs an Apple Developer membership and Janet's device registered first: `eas device:create` sends her a link, then `eas build --profile preview --platform ios`. TestFlight is the alternative (`eas build --profile production` and `eas submit`) and needs an App Store Connect record.

This version adds native modules (`expo-location`, and from earlier work `react-native-svg` and `expo-haptics`): any existing development build must be rebuilt.

## 7. Acceptance (with Janet)

1. Janet signs in on the device, completes her profile, and enters her invitation code: Play Study appears beside Training.
2. Play Study → Fall Creek → **Download**: the four parts verify, then **Set up this session**.
3. Choose **Standard**, place a point with the cross (the × is the coordinate; the pin floats above it), answer, review and save. With a connection, the record shows **Uploaded**.
4. Choose **Inventory**, pick the zone, answer the weather, shade and loose-parts questions, save.
5. Turn on **Show my location** from the map's location button: the device asks once; the blue dot and its accuracy circle appear; the button centres the map on her, or brings her position under the cross while placing.
6. Back on your computer, **Data** in the project (`/o/deca-lab/p/play-study/data`), `GET /v1/projects/<id>/observations` or the bootstrap's project in QGIS lists both records with zone, round type and placement.

Nothing in this runbook has been run against the hosted project yet. The same sequence (bootstrap twice, then the collector's own download, form and upload code) passed against local Supabase on October 8, 2026.
