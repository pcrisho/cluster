---
title: What is Cluster
description: Cluster is an open-source knowledge base and training platform that runs on your own server in your brand.
section: overview
order: 1
---

Cluster is an open-source platform for company knowledge and employee training, designed to run on your own infrastructure with full control over your data, branding, and languages.

## Four modules

Cluster is organized into four modules around a shared core (identity, organization structure, permissions, and file storage).

| Module | Purpose | Status |
|---|---|---|
| **KNOW** | Spaces, collaborative pages, version history, Markdown import/export, files, and search. | Built |
| **GROW** | Courses, lessons (text, video, files), quizzes, mandatory assignments, certificates, and compliance reports. | Built |
| **CONNECT** | Company directory, organization chart, feed, and celebrations. | Built |
| **LIFE** | Employee wellbeing and day-to-day workflows. | In preparation |

:::note
LIFE is currently in preparation and does not have a user guide yet. Instances can enable only the modules they need—for example, KNOW and GROW alone.
:::

## Open core and self-hosting

Cluster is built to be self-hosted with Docker Compose. Every feature documented in these guides is included in the open-source codebase and tested end-to-end.

- **No external telemetry**: your instance does not send usage data to third parties.
- **Your own domain and mail**: connect your reverse proxy for HTTPS and your SMTP server for invitations, password resets, and security alerts.

## Languages and branding

- **Bilingual out of the box**: every interface label, email, certificate PDF, and CSV export is available in **English** and **Spanish** (neutral Latin American). Each person can pick their own language or inherit the organization or instance default.
- **Custom themes**: set primary and secondary brand colors, font, and corner radius at the instance level, or allow each organization to apply its own logo and theme.

## Next steps

- Review [Features by module](/en/evaluate/features-by-module/) to evaluate what is available today.
- Check the [Requirements](/en/self-host/requirements/), then follow [First start](/en/self-host/first-start/) to launch an instance on your server.
