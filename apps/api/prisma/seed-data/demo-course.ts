/**
 * A published demo course for GROW, mandatory for the Engineering area (and its sub-areas) within 30 days.
 * Lessons are Markdown, converted with the shared editor schema.
 */
export interface DemoLesson {
  title: string;
  minutes: number;
  optional?: boolean;
  markdown: string;
}

export const DEMO_COURSE = {
  title: "Workplace safety essentials",
  description:
    "What everyone at Cluster needs to know to stay safe at work: how to report a hazard, the fire extinguishers we use and how to leave the building in an emergency.",
  sequential: true,
  assignTo: { areaName: "Engineering", dueInDays: 30 },
  sections: [
    {
      title: "Before you start",
      lessons: [
        {
          title: "Welcome",
          minutes: 3,
          markdown: `This course takes about 20 minutes. Complete the lessons in order; each one ends with **Mark as complete**.

## What you will learn

- How to report a hazard
- Which fire extinguisher to use
- How to leave the building in an emergency`,
        },
        {
          title: "Reporting a hazard",
          minutes: 4,
          markdown: `If you see something that could hurt someone, report it the same day.

1. Make the area safe if you can do it without risk.
2. Tell your area manager.
3. Write down what you saw, where and when.

> Nobody is blamed for reporting. A report that turns out to be nothing is still a good report.`,
        },
      ] as DemoLesson[],
    },
    {
      title: "Fire safety",
      lessons: [
        {
          title: "Types of fire extinguishers",
          minutes: 8,
          markdown: `## Water
For paper, wood and fabric. **Never** on electrical equipment or burning liquids.

## CO₂
For electrical equipment. Do not hold the horn: it gets extremely cold.

## Dry powder
For most fires, including liquids and gases. It reduces visibility, so use it in open spaces.`,
        },
        {
          title: "Evacuation routes",
          minutes: 6,
          markdown: `When the alarm sounds:

1. Stop what you are doing and leave by the nearest exit.
2. Do not use the lifts.
3. Go to the assembly point and wait until your area manager counts everyone.

Never go back inside until you are told it is safe.`,
        },
        {
          title: "Further reading",
          minutes: 2,
          optional: true,
          markdown: `Ask your area manager for the building's emergency plan. It shows every exit and the assembly point.`,
        },
      ] as DemoLesson[],
    },
  ],
  /** A last section with the quiz: choice questions graded at once, one written answer for a reviewer. */
  quiz: {
    section: "Check your knowledge",
    title: "Safety quiz",
    content: {
      passScore: 70,
      bankSize: null,
      shuffle: true,
      showCorrectAnswers: true,
      questions: [
        {
          id: "extinguisher-electrical",
          type: "single",
          prompt: "Which extinguisher do you use on electrical equipment?",
          points: 1,
          options: [
            { id: "water", text: "Water" },
            { id: "co2", text: "CO₂" },
            { id: "none", text: "None, leave it burning" },
          ],
          correct: ["co2"],
        },
        {
          id: "alarm",
          type: "multiple",
          prompt: "When the alarm sounds, what do you do?",
          points: 2,
          options: [
            { id: "exit", text: "Leave by the nearest exit" },
            { id: "lift", text: "Take the lift" },
            { id: "assembly", text: "Wait at the assembly point" },
          ],
          correct: ["exit", "assembly"],
        },
        {
          id: "hazard",
          type: "open",
          prompt:
            "Describe a hazard you have seen at work and how you would report it.",
          points: 2,
          guidance:
            "Full marks if it names the hazard and says the area manager is told the same day.",
        },
      ],
    },
  },
};

/**
 * A second, lessons-only course for everyone (assigned to the root area), so Reports and My learning show
 * completed, in-progress and not-started people; the seed adds that progress (seedDemoProgress).
 */
export const SECURITY_COURSE = {
  title: "Information security awareness",
  description:
    "The habits that keep Cluster's systems and our customers' data safe: strong sign-ins, spotting phishing and handling data with care.",
  dueInDays: 45,
  lessons: [
    {
      title: "Strong sign-ins",
      minutes: 4,
      markdown: `Use a password manager and a long, unique password for every account.

Turn on two-factor authentication everywhere it is offered, and never share a code.`,
    },
    {
      title: "Spotting phishing",
      minutes: 5,
      markdown: `Be suspicious of messages that:

- ask you to act urgently,
- link to a sign-in page you did not expect,
- come from an address that is almost right.

When in doubt, report the message to the security team instead of clicking.`,
    },
    {
      title: "Handling customer data",
      minutes: 4,
      markdown: `Only open customer data you need for your work, never copy it to personal devices, and delete exports when you are done.`,
    },
  ] as DemoLesson[],
};
