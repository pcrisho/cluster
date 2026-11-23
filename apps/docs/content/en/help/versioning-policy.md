---
title: Versioning policy
description: How Cluster versions releases using Semantic Versioning during pre-1.0 development.
section: help
order: 3
---

Cluster follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`).

## Pre-1.0 status

Cluster is currently pre-`1.0` (`0.x.y`) and has not yet entered general production deployments. During the `0.x` phase:

- Minor releases (`0.x.0`) may include breaking changes to configuration, database schema, or APIs when simplifying or hardening the platform.
- Every release tag is documented in the [Changelog](/en/changelog/0-1-0/) with upgrade notes and any required migration steps.
- Once `1.0.0` is released, breaking changes will be reserved for major (`X.0.0`) versions.
