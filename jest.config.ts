import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    maxWorkers: 4,
    verbose: true,
    forceExit: true,
    silent: true,
    collectCoverage: true,
    coverageReporters: ["html"]
};

export default config;
