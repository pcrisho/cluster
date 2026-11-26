import tseslint from "typescript-eslint";

/**
 * ESLint config for @cluster/api (NestJS).
 *
 * Mirrors the spirit of apps/web/eslint.config.mjs but without
 * the Next/React rules — this package has no JSX. Rules:
 *
 *   - typescript-eslint recommended: catches a wide range of
 *     type-safety and correctness issues.
 *   - no-explicit-any as error: matches the strictness the web
 *     package is converging to.
 *   - no-unused-vars as warn: surfaces dead code without blocking
 *     CI on cosmetic noise (underscore-prefixed names are ignored).
 */
const FEATURES = {
  know: ["know", "documents"],
  grow: ["grow"],
  connect: ["connect"],
  life: ["life"],
};
const CORE = [
  "auth",
  "org",
  "instance",
  "mail",
  "storage",
  "notification",
  "collab",
];
const ALL_FEATURE_DIRS = Object.values(FEATURES).flat();

/** Blocks relative imports of the given module directories. */
const forbidModules = (dirs, message) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: dirs.map((dir) => ({
        group: [`**/${dir}`, `**/${dir}/**`],
        message,
      })),
    },
  ],
});

/**
 * Rule 2 of docs/specs/org/rls: the system client (owner role, bypasses row-level security) may be
 * imported only from this closed list. An addition needs a line in that spec too.
 * Uses the typescript-eslint variant of the rule so it does not replace the dependency rule's
 * options (a later config object with the same rule id wins as a whole).
 */
const SYSTEM_PRISMA_ALLOWED = [
  "src/prisma/prisma.module.ts",
  "src/prisma/system-prisma.service.ts",
  "src/health.controller.ts",
  "src/modules/auth/auth.service.ts",
  "src/modules/auth/auth-user.service.ts",
  "src/modules/auth/invitation.service.ts",
  "src/modules/auth/invitation-sender.ts",
  "src/modules/auth/session.service.ts",
  "src/modules/auth/password-links.service.ts",
  "src/modules/auth/auth-events.service.ts",
  "src/modules/auth/login-throttle.service.ts",
  "src/modules/auth/mfa.service.ts",
  "src/modules/auth/mfa-flow.service.ts",
  "src/modules/auth/auth-challenge.service.ts",
  "src/modules/auth/security-mail.service.ts",
  "src/modules/instance/instance.service.ts",
  "src/modules/grow/certificates.service.ts",
  "src/modules/know/page-collab.provider.ts",
  "src/modules/know/space-collab.provider.ts",
  "src/test-helpers.ts",
  "src/modules/org/node-partitions.helpers.ts",
  "src/e2e-global-setup.ts",
  "src/modules/collab/collab-integration-harness.ts",
  "src/scripts/access-link.ts",
  "src/scripts/reset-mfa.ts",
  "src/scripts/sweep-auth.ts",
  "src/scripts/sweep-lesson-files.ts",
  "src/scripts/sweep-page-images.ts",
  "src/**/*.e2e-spec.ts",
  "src/**/*.spec.ts",
];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "test/**"],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Dependency rule: core never imports a feature; a feature never imports
  // another feature. A feature may span several directories (KNOW = know + documents).
  ...Object.entries(FEATURES).map(([feature, ownDirs]) => ({
    files: ownDirs.map((dir) => `src/modules/${dir}/**/*.ts`),
    rules: forbidModules(
      ALL_FEATURE_DIRS.filter((dir) => !ownDirs.includes(dir)),
      `The ${feature} feature must not import another feature. Move what both need into a core module.`,
    ),
  })),
  {
    files: [
      ...CORE.map((dir) => `src/modules/${dir}/**/*.ts`),
      "src/common/**/*.ts",
      "src/prisma/**/*.ts",
    ],
    rules: forbidModules(
      ALL_FEATURE_DIRS,
      "Core must not import a feature module. Invert the dependency or move the shared code to core.",
    ),
  },
  {
    files: ["src/**/*.ts"],
    ignores: SYSTEM_PRISMA_ALLOWED,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/prisma/system-prisma.service"],
              message:
                "SystemPrismaService bypasses row-level security and is allowed only on the closed list in docs/specs/org/rls (rule 2). Use PrismaService, or add the file to the list in the spec and in eslint.config.mjs.",
            },
          ],
        },
      ],
    },
  }
);
