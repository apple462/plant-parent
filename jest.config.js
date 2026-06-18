/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  // Resolve the `@/*` path alias (mirrors tsconfig.json paths) so screens and
  // components that import via `@/...` can be unit-tested under jest.
  moduleNameMapper: {
    // Stub stylesheet imports (e.g. `@/global.css`) so jest can parse modules
    // that pull in CSS. Must precede the `@/*` rule below.
    '\\.css$': '<rootDir>/jest/styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}'],
};
