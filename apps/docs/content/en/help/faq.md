---
title: Frequently asked questions
description: Answers to common questions about self-hosting, modules, languages, and data isolation in Cluster.
section: help
order: 1
---

## Can we enable only KNOW and GROW?

Yes. Superadmins choose which modules are available on the instance, and organization administrators can toggle individual modules (**KNOW**, **GROW**, **CONNECT**, **LIFE**) on or off for their organization.

## What is the status of LIFE?

**LIFE** is currently in preparation and has no user guide yet.

## Does Cluster support multiple organizations on one server?

Yes. Each organization's data is isolated at the database layer using PostgreSQL Row-Level Security, at the API layer via session scoping, and in object storage via access-checked file routes.

## Can we run Cluster without an SMTP server?

Yes. If `SMTP_HOST` is left empty, Cluster skips sending emails. Administrators can generate one-time access links or initial passwords from **Settings → Members** (or use the `access-link` operator command).

## How do we switch between English and Spanish?

Every person can choose their language in **Settings → My account** or from the user menu. If unset, they inherit the organization's language, then the instance default.
