/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2022",
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strictNullChecks: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.module.ts",
    "!**/main.ts",
    "!**/index.ts",
  ],
};
