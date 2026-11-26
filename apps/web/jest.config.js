/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node10",
          jsx: "react-jsx",
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
}

export default config
