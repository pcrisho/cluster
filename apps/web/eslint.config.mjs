import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import i18next from "eslint-plugin-i18next"

const FEATURES = ["know", "grow", "connect"]

const featureGroup = (feature) => [
  `@/components/${feature}`,
  `@/components/${feature}/**`,
  `@/lib/${feature}-*`,
]

const forbidFeatures = (features, message) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: features.map((feature) => ({
        group: featureGroup(feature),
        message,
      })),
    },
  ],
})

// Copy goes through the catalogs (messages/*.json): no hard-coded text in JSX or in the attributes
// people read. Switched on per area as each one is translated (docs/specs/core/i18n-timezone).
const TRANSLATED = [
  "app/{login,register,forgot-password,set-password,verify}/**/*.tsx",
  "app/(app)/app-sidebar-shell.tsx",
  "app/(app)/{settings,know,connect}/**/*.tsx",
  "components/{auth,notifications,settings,instance,know,connect}/**/*.tsx",
  "app/(app)/grow/(tabs)/layout.tsx",
  "components/grow/**/*.tsx",
  "components/shared/{documents,rich-text-editor,collab}/**/*.tsx",
  "components/shared/{position-dialog,require-admin,org-node-picker,country-combobox,phone-input,color-picker,color-canvas,password-input,saving-indicator,principal-picker,entity-icon-picker,timezone-combobox,language-select}.tsx",
  "components/{app-sidebar,nav-main,nav-user,org-header,dashboard-header,global-command-menu,i18n-bridge}.tsx",
]

// An internal link must be a next/link <Link>: a plain <a> reloads the whole page. Links that open a new
// tab (target) and non-route URLs (mailto:, #anchor, downloads, API) are fine as <a>.
const INTERNAL_HREF = String.raw`/^\/(?!\/)/`
const plainAnchor =
  "JSXOpeningElement[name.name='a']:not(:has(JSXAttribute[name.name='target']))"
const noPlainInternalAnchor = {
  "no-restricted-syntax": [
    "error",
    {
      selector: `${plainAnchor} > JSXAttribute[name.name='href'][value.value=${INTERNAL_HREF}]`,
      message:
        "Internal links use next/link: <Link href=...>, not a plain <a>.",
    },
    {
      selector: `${plainAnchor} > JSXAttribute[name.name='href'] TemplateLiteral > TemplateElement:first-child[value.raw=${INTERNAL_HREF}]`,
      message:
        "Internal links use next/link: <Link href=...>, not a plain <a>.",
    },
    {
      selector:
        "JSXOpeningElement[name.name='BreadcrumbLink'] > JSXAttribute[name.name='href']",
      message:
        "Use <BreadcrumbLink asChild><Link href=...>: a plain href reloads the page.",
    },
  ],
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Dependency rule: core never imports a feature; a feature never imports another feature.
  ...FEATURES.map((feature) => ({
    files: [
      `components/${feature}/**/*.{ts,tsx}`,
      `app/(app)/${feature}/**/*.{ts,tsx}`,
      `lib/${feature}-*.ts`,
    ],
    rules: forbidFeatures(
      FEATURES.filter((other) => other !== feature),
      `The ${feature} feature must not import another feature. Move what both need into core.`
    ),
  })),
  {
    files: [
      "components/{settings,shared,ui,layout,auth,notifications,instance}/**/*.{ts,tsx}",
      "lib/{api,org-api,admin-api,settings-api,notifications-api,auth-context,use-entity-autosave}.{ts,tsx}",
    ],
    rules: forbidFeatures(
      FEATURES,
      "Core must not import a feature. Invert the dependency or move the shared code to core."
    ),
  },
  {
    files: TRANSLATED,
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          // t(), t.rich() and any translator named t… (tNav, tv…) take keys, not copy.
          // The plugin's defaults (symbols, CONSTANT_CASE), anything without a letter (emoji, ✓), the product's name.
          words: {
            exclude: [
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              "[^A-Za-z]+",
              "Cluster",
            ],
          },
          callees: {
            exclude: [
              "^t\\w*$",
              "^t\\w*\\.(rich|markup|raw|has)$",
              "^(dates|format)\\.\\w+$",
            ],
          },
          "jsx-attributes": {
            include: [
              "aria-label",
              "title",
              "placeholder",
              "alt",
              "label",
              "description",
              "heading",
            ],
          },
        },
      ],
    },
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: noPlainInternalAnchor,
  },
  {
    files: ["components/Silk.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
])

export default eslintConfig
