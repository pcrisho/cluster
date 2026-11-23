/**
 * Demo KNOW spaces for a small software company: open to everyone in the organization, created by the admin.
 * Pages are Markdown, converted with the shared editor schema.
 */
export interface DemoSpace {
  name: string;
  icon: string;
  description: string;
  pages: { title: string; icon: string; markdown: string }[];
}

export const DEMO_SPACES: DemoSpace[] = [
  {
    name: "Engineering handbook",
    icon: "code",
    description: "How we build, review and ship software at Cluster.",
    pages: [
      {
        title: "How we work",
        icon: "layers",
        markdown: `We work in small, reviewed changes that reach production every day.

## Principles

- **Small pull requests.** One topic per change; under 400 lines when possible.
- **Tests first.** A bug fix starts with the test that proves it.
- **Write it down.** Decisions live in this space, not in chat threads.`,
      },
      {
        title: "Code review",
        icon: "check-circle",
        markdown: `Every change is reviewed by one teammate before it merges.

## As an author

1. Explain *why* in the description, not only *what*.
2. Keep the checks green before asking for a review.

## As a reviewer

- Answer within one working day.
- Separate blocking comments from suggestions.`,
      },
      {
        title: "Releases",
        icon: "rocket",
        markdown: `We release from \`main\` every weekday at 10:00.

- A failed release is rolled back first and investigated second.
- Release notes are written by the team that shipped the change.`,
      },
    ],
  },
  {
    name: "Onboarding",
    icon: "users",
    description: "Everything you need in your first weeks at Cluster.",
    pages: [
      {
        title: "Your first week",
        icon: "calendar",
        markdown: `Welcome to Cluster! This week is about meeting people and setting up.

## Checklist

- [ ] Meet your manager and your onboarding buddy
- [ ] Set up your laptop and two-factor authentication
- [ ] Complete the mandatory courses in **GROW → My learning**
- [ ] Read the Engineering handbook or your area's space`,
      },
      {
        title: "Tools we use",
        icon: "wrench",
        markdown: `- **Cluster KNOW**: documentation and handbooks
- **Cluster GROW**: courses and certificates
- **Calendar**: meetings and time off

Ask in your team's channel if you are missing an account.`,
      },
    ],
  },
  {
    name: "Security policies",
    icon: "shield",
    description:
      "The rules that keep our customers' data and our systems safe.",
    pages: [
      {
        title: "Acceptable use",
        icon: "file-text",
        markdown: `Company devices and accounts are for work.

- Lock your screen when you leave your desk.
- Never share your password or your authenticator codes.
- Install software only from the approved catalog.`,
      },
      {
        title: "Reporting an incident",
        icon: "bell",
        markdown: `If you suspect a security incident, report it **immediately** to the security team.

1. Do not try to investigate on your own.
2. Write down what you saw and when.
3. Keep the affected device on and disconnected from the network.`,
      },
    ],
  },
];
