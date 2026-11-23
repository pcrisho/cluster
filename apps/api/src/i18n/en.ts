/**
 * Texts the API writes itself (e-mails, the certificate PDF, the compliance CSV), in English: the
 * source language. Each other language is a file typed as `Messages`, so a missing key fails
 * typecheck. Placeholders are `{name}`; in HTML templates the values are escaped.
 */
export const en = {
  email: {
    invite: {
      subject: "You've been invited to {organization} on Cluster",
      text: "Hi {name},\n\nYou've been invited to {organization} on Cluster. Set your password to get started (link valid for 7 days):\n\n{link}\n",
      html: '<p>Hi {name},</p><p>You\'ve been invited to <strong>{organization}</strong> on Cluster.</p><p><a href="{link}">Set your password</a> to get started. The link is valid for 7 days.</p>',
    },
    reset: {
      subject: "Reset your Cluster password",
      text: "Hi {name},\n\nUse this link to set a new password (valid for 1 hour):\n\n{link}\n\nIf you didn't request it, ignore this email.\n",
      html: '<p>Hi {name},</p><p><a href="{link}">Set a new password</a>. The link is valid for 1 hour.</p><p>If you didn\'t request it, ignore this email.</p>',
    },
    mfaReset: {
      subject: "An administrator reset your Cluster sign-in",
      text: "Hi {name},\n\nAn administrator of your organization reset your two-step verification and your password, and signed you out everywhere. Set a new password with this link (valid for 24 hours):\n\n{link}\n\nThen you can set up two-step verification again. If you did not expect this, contact your administrator.\n",
      html: '<p>Hi {name},</p><p>An administrator of your organization reset your two-step verification and your password, and signed you out everywhere.</p><p><a href="{link}">Set a new password</a>. The link is valid for 24 hours. Then you can set up two-step verification again.</p><p>If you did not expect this, contact your administrator.</p>',
    },
  },
  /** Notices of a change to someone's credentials (docs/specs/auth/hardening R-31): no link to act on. */
  security: {
    text: "Hi {name},\n\n{what}\n\nWhen: {when}\nFrom the address: {ip}\n\nIf it wasn't you, tell your organization's administrator right away.\n",
    html: "<p>Hi {name},</p><p>{what}</p><p>When: {when}<br>From the address: {ip}</p><p>If it wasn't you, tell your organization's administrator right away.</p>",
    unknownAddress: "unknown",
    passwordChanged: {
      subject: "Your Cluster password was changed",
      what: "The password of your Cluster account was changed.",
    },
    passwordReset: {
      subject: "Your Cluster password was reset",
      what: "The password of your Cluster account was reset with a link sent to this email.",
    },
    emailChanged: {
      subject: "The email address of your Cluster account was changed",
      what: "An administrator of your organization changed the email address you sign in to Cluster with and signed you out everywhere. If you did not expect it, contact your administrator.",
    },
    mfaEnabled: {
      subject: "You turned on two-step verification in Cluster",
      what: "Two-step verification is now on for your Cluster account; signing in asks for a code from your app.",
    },
    mfaDisabled: {
      subject: "You turned off two-step verification in Cluster",
      what: "Two-step verification was turned off for your Cluster account; signing in no longer asks for a code.",
    },
    mfaChanged: {
      subject: "You moved two-step verification to a new device in Cluster",
      what: "Two-step verification of your Cluster account now uses a new device; the previous one and your old recovery codes no longer work, and your other sessions were signed out.",
    },
    recoveryCodeUsed: {
      subject: "A recovery code of your Cluster account was used",
      what: "One of your recovery codes was used to confirm a sign-in or a change on your Cluster account. Each code works once.",
    },
    accessLinkCreated: {
      subject: "An administrator created a link to reset your Cluster password",
      what: "An administrator of your organization created a link to reset the password of your Cluster account. If you did not expect it, contact your administrator.",
    },
  },
  /** The credentials file of an ADMIN (docs/specs/auth/access-without-mail). */
  exportAccess: {
    sheet: "Access",
    notice:
      "This file holds sign-in credentials for the people listed. Give each one their row, then delete the file. Each link or password works until its time runs out.",
    headers: {
      firstName: "First name",
      lastName: "Last name",
      email: "E-mail",
      path: "Area",
      employeeCode: "Employee code",
      credential: "Access link or initial password",
      expiresAt: "Expires at",
    },
  },
  /** The sheet of instructions in the bulk import template (docs/specs/org/bulk-import). The headers stay English. */
  importTemplate: {
    sheet: "People",
    instructionsSheet: "Instructions",
    columnHeader: "Column",
    ruleHeader: "What goes in it",
    columns: {
      node_1: "Main node (client or company). Required while the organization isolates its main nodes.",
      areas: "An area below the previous level, one level per column. The person goes to the last one filled. Do not leave gaps.",
      node_1_code: "Code of the main node. When given, the main node is found by its code and never renamed.",
      first_name: "Required for new people. Empty keeps the current name.",
      last_name: "Required for new people. Empty keeps the current name.",
      email: "Required. It identifies the person: a new address creates a member, an existing member is updated.",
      employee_code: "Employee code, unique in the organization.",
      position: "Name of an existing position. Positions are not created from the file.",
      is_node_manager: "yes makes the person the manager of their area, no removes it, empty keeps it.",
      entry_date: "Entry date as YYYY-MM-DD or a date cell.",
      can_create_spaces: "yes allows creating KNOW spaces, no removes it, empty keeps it.",
      can_delete_spaces: "yes allows deleting KNOW spaces, no removes it, empty keeps it.",
    },
    notes: {
      title: "How it works",
      format: "Only the first sheet is read, up to 2000 rows. Keep the header row as it is.",
      preview: "Preview first: nothing is written until you apply, and one error stops the whole import.",
      roles: "Everyone created is a collaborator. Roles and course-manager permission are never changed from this file.",
      keep: "People missing from the file are not deactivated. An empty cell keeps the current value.",
      flags: "Yes/no columns accept yes, no, true, false, 1 and 0.",
    },
  },
  certificate: {
    documentTitle: "Certificate · {course}",
    title: "Certificate of completion",
    certifies: "This certifies that",
    completed: "has completed the course",
    issued: "Issued {date} · Certificate {code}",
    verify: "Verify at {url}",
  },
  report: {
    columns: {
      person: "Person",
      email: "Email",
      area: "Area",
      position: "Position",
      course: "Course",
      status: "Status",
      progress: "Progress",
      dueDate: "Due date",
      completed: "Completed",
      bestScore: "Best score",
      attempts: "Attempts",
    },
    states: {
      NOT_STARTED: "Not started",
      IN_PROGRESS: "In progress",
      COMPLETED: "Completed",
      OVERDUE: "Overdue",
    },
  },
};

type Strings<T> = {
  [K in keyof T]: T[K] extends string ? string : Strings<T[K]>;
};

export type Messages = Strings<typeof en>;
