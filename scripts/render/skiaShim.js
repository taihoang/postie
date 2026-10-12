// Maps the native Skia entry to its CanvasKit (headless) build so scenes can
// be rendered to PNG in Node for visual checks. Dev tooling only.
const headless = require('@shopify/react-native-skia/lib/commonjs/headless');

// `Skia` must resolve lazily: CanvasKit is loaded asynchronously by the test.
const Skia = new Proxy(
  {},
  {
    get(_target, prop) {
      return headless.getSkiaExports().Skia[prop];
    },
  },
);

// Core helpers the headless entry does not re-export.
const vec = (x = 0, y) => Skia.Point(x, y ?? x);

module.exports = { ...headless, Skia, vec };
