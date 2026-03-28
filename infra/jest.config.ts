import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/localstack/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
}

export default config
