---
title: Features by module
description: A summary of the capabilities currently built in KNOW, GROW, CONNECT, and the core platform.
section: evaluate
order: 1
---

This page summarizes what is built and verified in Cluster today.

## Core platform

- **Authentication and sessions**: email and password sign-in, Postgres-backed sessions in `httpOnly` cookies, per-user active session list with revocation, password policies, and adaptive login throttling.
- **Two-step verification (2FA)**: TOTP authenticator apps with single-use recovery codes. Required for superadmins and configurable per organization for administrators.
- **Organization structure**: hierarchical areas (`OrgNode` tree) with designated managers, positions, member assignments, and bulk member import from `.xlsx` spreadsheets.
- **Branding and localization**: custom instance and organization themes (colors, font, radius, logo) with contrast checks, plus English and Spanish across the UI, emails, PDFs, and CSV exports.
- **Audit log**: organization activity log recording settings, member, role, and theme changes.

## KNOW (knowledge base)

- **Spaces and access control**: organize pages into spaces with per-space access lists (`viewer`, `editor`, `manager`) granted to people, areas, or positions.
- **Collaborative editor**: rich-text document editor with realtime multi-user editing, slash commands, tables, callouts, images, and attached files.
- **Version history**: save named or automatic snapshots, inspect diffs, and restore previous versions even while others are editing.
- **Markdown**: import `.md` files into a space and export any page to Markdown.
- **Files and previews**: inline viewer for common images and PDFs, plus downloadable attachments.
- **Search**: full-text search across accessible spaces and pages.

## GROW (learning management)

- **Course authoring**: build courses with sections and lessons supporting rich text, video links, downloadable files, and uploaded MP4/WebM videos.
- **Quizzes and reviews**: multiple-choice quizzes with passing thresholds, attempt limits, and optional manual review.
- **Mandatory assignments**: assign courses to individuals, areas, or positions with optional due dates.
- **Learner experience**: My learning, catalog, sequential step locking, and automatic progress reconciliation when a course outline changes.
- **Certificates and verification**: generated PDF certificates with a public verification code and URL.
- **Compliance reports**: dashboard tiles, filterable completion tables, area-manager scoping, and CSV export.

## CONNECT (directory and feed)

- **Directory**: searchable member directory with table and card views, filters by area and position, and URL-persisted state.
- **Organization chart**: interactive tree showing reporting lines, managers, and subtree counts.
- **Feed and celebrations**: company posts and milestone celebrations.
