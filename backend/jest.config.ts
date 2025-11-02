import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  setupFilesAfterEnv: [],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};

export default config;
