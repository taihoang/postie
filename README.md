# Postie

A no-login iOS app (Expo / React Native) that turns 2–8 photos into a polished collage, or a seamless swipe carousel of up to 20 slides, and hands it to Instagram. Everything runs on the device.

Requirements: [Postie — Requirements](https://claude.ai/code/artifact/a83e6298-0cba-4f57-adda-b09fc42583dc).

## Run it

Postie uses native modules (Skia, Reanimated, AdMob), so it needs a **development build**; Expo Go won't work.

**Local (Xcode installed):**

```bash
npm install
npx expo run:ios            # builds the dev client and starts Metro
```

`run:ios` needs CocoaPods. If it's missing, install it with `brew install cocoapods` first.

**Cloud (no Xcode):**

```bash
npx eas-cli@latest build --profile development --platform ios   # simulator build
npx expo start                                                   # then open the dev client
```

Use the `development-device` profile for a build you can install on a phone.

## Checks

```bash
npm run typecheck      # app + render tooling
npm run lint
npm test               # unit tests: geometry, layout trees, documents, undo, ads config
npm run render:check   # renders sample collages with the real Skia scene code into ./render-out
```

`render:check` draws real collages through CanvasKit in Node: grids, rotation and flip, zoom, every texture, seamless slices with a pixel-continuity check at each seam, and high-res export. Open the PNGs to see exactly what the exporter produces.

## How it's built

| Area | Where | Notes |
| --- | --- | --- |
| Data model | `src/core/types.ts` | Plain JSON documents; templates are cell rectangles as canvas fractions (T-10) |
| Geometry | `src/core/geometry.ts` | Worklets shared by the editor (UI thread) and the exporter, so the export matches the screen |
| Templates | `src/core/presets/*.json`, `src/core/layoutTree.ts` | Presets ship as JSON; the builder edits guillotine trees |
| Document ops | `src/core/doc.ts` | Pure functions: place, swap, apply template, slides… |
| Editor canvas | `src/editor/EditorCanvas.tsx` | Skia + Gesture Handler + Reanimated; edits commit on release |
| Rendering | `src/render/*` | One `Scene` for export, thumbnails and swipe preview; procedural textures in SkSL |
| Export | `src/services/exporter.ts` | Off-screen render at 1080 or 2160 px, originals decoded at the needed size |
| Storage | `src/services/drafts.ts`, `src/state/*` | Drafts as JSON in the app sandbox; settings via AsyncStorage |
| Ads | `src/ads/*` | Dormant until the remote flag is on |

## Requirements coverage

Built and checked with unit tests, render checks, typecheck and an iOS bundle. Not yet run on a device or simulator.

| Section | Status |
| --- | --- |
| Templates T-1 – T-10 | All built. Merge (T-6) works for neighbors whose union is a rectangle. |
| Canvas sizes, C-1 – C-4 | All built, including Custom W × H. 4:5 is the default. |
| Photos P-1 – P-11, P-13 | Built. **P-12 (adjustments and filters, Could) is not built.** |
| Borders B-1 – B-9, B-11 | Built. **B-10 (eyedropper, Could) is not built.** |
| Seamless S-1 – S-7, S-9 – S-13 | Built. S-8 (seam face warning) is post-v1, as planned. S-12: see note 3. |
| Export E-1 – E-9 | Built. **E-10 (Share to Story, Could) is not built**; it needs a Meta app ID. |
| Privacy A-1 – A-12 | Built in the app. A-6 and A-11 are App Store Connect tasks (see checklist). |
| Non-functional N-1 – N-8 | Designed for (previews at 1600 px, gestures on the UI thread). Performance not yet measured on a device. N-5: iOS 16.4+ (note 1). N-8 Android not tested. |
| Ads AD-1 – AD-9 | Built and off by default. AD-7 has release tasks (see checklist). |

Notes:

1. **iOS 16.4, not 16.0.** Expo SDK 57 requires 16.4 or later.
2. **Long panoramas.** "Share full panorama" is one image, and iPhones can't render images wider than 16,384 px. Very long carousels (16+ slides, or 8+ in High-res) are scaled down to fit. Slides always export at full size.
3. **Album vs. add-only access.** S-12 asks for a dedicated album, but iOS only lets apps create albums with full library access. A-4 limits Postie to add-only. Slides still save in order. The album is created only if the user has already granted full access elsewhere.

## Before release

- [ ] Replace the bundle id `com.postie.app` in `app.json` if you use a different one.
- [ ] Host `config/app-settings.json` (keep `"adsEnabled": false`) and set `REMOTE_CONFIG_URL` in `src/ads/config.ts`. If the URL doesn't respond, ads stay off.
- [ ] Host a privacy policy (draft in `PRIVACY.md`) and add its URL in App Store Connect (A-11).
- [ ] App Privacy label: "Data Not Collected" (A-6).
- [ ] The camera and microphone permission strings are required by the photo-picker library but never shown; Postie uses neither.

**Before turning ads on (AD-7):**

- [ ] Create the AdMob app and two banner units; put the app id in `app.json` (`react-native-google-mobile-ads` plugin) and the unit ids in `src/ads/config.ts`. The current ids are Google's test ids.
- [ ] Publish `app-ads.txt` on your developer website.
- [ ] Set up the EEA/UK consent message (UMP) in AdMob. The app already calls `AdsConsent.gatherConsent()`, only once ads are on. **Don't add an IDFA explainer message**: it would trigger the App Tracking Transparency prompt, which Postie deliberately doesn't use (AD-6).
- [ ] Update the App Privacy label in App Store Connect, then ship a build.
- [ ] Flip `adsEnabled` to `true` in the hosted JSON. `placements.collages` turns on the second placement; `savedEveryNthExport` sets the frequency.

## Icon

`assets/icon.png` and the other icons are original artwork drawn with Skia (`scripts/render/icon.test.tsx`). To regenerate: `GENERATE_ICONS=1 npm run render:check -- icon`. Then flatten `icon.png` to remove its alpha channel, which App Store icons can't have.
