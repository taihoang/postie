// Headless render checks: `npm run render:check` writes PNGs of sample collages.
const path = require('path');

const babelPreset = require.resolve('babel-preset-expo', { paths: [path.dirname(require.resolve('expo/package.json'))] });

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/scripts/render/**/*.test.tsx'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: [babelPreset] }] },
  moduleNameMapper: {
    '^@shopify/react-native-skia$': '<rootDir>/scripts/render/skiaShim.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 240000,
};
