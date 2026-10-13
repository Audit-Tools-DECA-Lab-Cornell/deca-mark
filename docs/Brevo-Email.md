# Email setup

Supabase Auth uses Brevo SMTP, configured by the user in the dashboard. The API
uses Brevo REST for invitations, reminders and notifications. Templates share the
web/mobile Contour tokens.

## Deploy

Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
`EMAIL_ENABLED=true`, and `EMAIL_APP_URL` on the API host, then deploy API and web.
The private outbox migration is already applied. Local Auth keeps using Mailpit.

Install `supabase/templates/*.html` and enable the matching security notifications
in the Supabase dashboard; those template settings remain unverified. Both apps
keep their existing six-digit verification/recovery flows.

Optional dashboard alternative, from `backend/`, with SMTP variables and
`SUPABASE_ACCESS_TOKEN` configured (omit `--apply` to review):

```sh
PYTHONPATH=src uv run --frozen python -m fieldmaps_api.email.setup_auth --project-ref lezmqhuucfwqknspgcdy --apply
```

## Use and check

Addressed invitations enqueue automatically. Managers can schedule, inspect and
cancel project email through `POST`/`GET /v1/projects/{project}/emails` and
`DELETE /v1/projects/{project}/emails/{delivery}`. Schedule requests contain a
request UUID, recipient member UUID, kind, heading, message and optional time.
The queue checks access, retries transient failures and clears completed content.

`pnpm tokens` regenerates all shared styles/templates; `pnpm tokens:check` detects
drift. To validate Brevo without sending mail, run from `backend/`:

```sh
PYTHONPATH=src uv run --frozen python -m fieldmaps_api.email.check_provider
```

97 targeted backend checks passed. An existing export performance failure is
separate from email. Test actual signup, recovery and invitation delivery after
deployment; pushing code does not verify deployment or inbox delivery.
