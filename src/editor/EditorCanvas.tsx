/**
 * The interactive canvas. Drawing and gestures run on the UI thread (P-5):
 * frame geometry lives in shared values that gestures update directly, and
 * the result is committed to the document (and undo history) when the
 * fingers lift.
 */
import {
  Canvas,
  DashPathEffect,
  Group,
  Image,
  Line,
  Rect,
  RoundedRect,
  Text as SkText,
  matchFont,
  type SkImage,
} from '@shopify/react-native-skia';
import React, { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { STORY_SAFE_ZONE, docSize, layoutParams, unitFor } from '@/core/canvas';
import {
  clamp,
  clampCamera,
  cornerPoint,
  fitCamera,
  frameBox,
  frameRadius,
  gestureCrop,
  hitTestFrame,
  imageTransform,
  moveFreeRect,
  normalizeCrop,
  resizeFreeRect,
  seamlessZoomRange,
  toCanvas,
  type Camera,
  type Corner,
  type LayoutParams,
  type Point,
} from '@/core/geometry';
import type { CollageDoc, Crop, FRect, PRect } from '@/core/types';
import { BackgroundLayer } from '@/render/Background';
import { PLACEHOLDER_FILL, PLACEHOLDER_INK, type ImageMap } from '@/render/Scene';
import { haptic } from '@/services/haptics';

const PAD = 20;
const HANDLE_HIT = 26;
const MOVE_HANDLE_OFFSET = 22;
const SWAP_DELAY_MS = 380;

type LiveFrame = { id: string; rect: FRect; crop: Crop; free: boolean; hasPhoto: boolean; iw: number; ih: number };

type GestureMode = 'none' | 'photo' | 'canvas' | 'move' | 'resize';

type GState = {
  mode: GestureMode;
  index: number;
  startCrop: Crop;
  startRect: FRect;
  startCam: Camera;
  anchor: Point;
  /** Pan translation at the moment the current segment began. */
  tx0: number;
  ty0: number;
  corner: Corner;
  active: number;
  pinching: boolean;
  rebasePan: boolean;
  snapped: boolean;
  /** Frame state when the interaction began, to skip no-op commits. */
  origCrop: Crop;
  origRect: FRect;
};

const IDLE: GState = {
  mode: 'none',
  index: -1,
  startCrop: { scale: 1, fx: 0.5, fy: 0.5, rotation: 0, flip: false },
  startRect: { x: 0, y: 0, w: 0, h: 0 },
  startCam: { s: 1, tx: 0, ty: 0 },
  anchor: { x: 0, y: 0 },
  tx0: 0,
  ty0: 0,
  corner: 0,
  active: 0,
  pinching: false,
  rebasePan: false,
  snapped: false,
  origCrop: { scale: 1, fx: 0.5, fy: 0.5, rotation: 0, flip: false },
  origRect: { x: 0, y: 0, w: 0, h: 0 },
};

type SwapState = { active: boolean; from: number; target: number; x: number; y: number };

export type CanvasApi = {
  /** Slide currently in the middle of the view (seamless). */
  currentSlide: () => number;
};

type Props = {
  doc: CollageDoc;
  images: ImageMap;
  selectedFrameId: string | null;
  showSeams: boolean;
  showSafeZone: boolean;
  apiRef?: React.RefObject<CanvasApi | null>;
  onTapFrame: (frameId: string | null, empty: boolean) => void;
  onDoubleTapFrame: (frameId: string) => void;
  onCommitCrop: (frameId: string, crop: Crop) => void;
  onCommitRect: (frameId: string, rect: FRect) => void;
  onSwap: (fromId: string, toId: string) => void;
};

const font = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }), fontSize: 12, fontWeight: '600' });

export function EditorCanvas(props: Props) {
  const { doc, images, selectedFrameId, showSeams, showSafeZone } = props;
  const [view, setView] = useState({ w: 0, h: 0 });

  const size = docSize(doc);
  const unit = unitFor(doc.canvas);
  const seamless = doc.mode === 'seamless';
  const slideW = doc.canvas.width;

  // ---- Shared state -------------------------------------------------------
  const framesSV = useSharedValue<LiveFrame[]>(toLiveFrames(doc));
  const layoutSV = useSharedValue<LayoutParams>(layoutParams(doc));
  const cam = useSharedValue<Camera>({ s: 1, tx: 0, ty: 0 });
  const viewSV = useSharedValue({ w: 0, h: 0 });
  const limits = useSharedValue({ min: 1, max: 1 });
  const g = useSharedValue<GState>(IDLE);
  const swap = useSharedValue<SwapState>({ active: false, from: -1, target: -1, x: 0, y: 0 });
  const selectedSV = useSharedValue<string | null>(selectedFrameId);
  const meta = useSharedValue({ seamless, slides: doc.slides, slideW });

  // Layout effects run before the frame is shown, so new frames never flash empty.
  useLayoutEffect(() => {
    framesSV.set(toLiveFrames(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.frames, doc.photos, framesSV]);

  useLayoutEffect(() => {
    layoutSV.set(layoutParams(doc));
    meta.set({ seamless, slides: doc.slides, slideW });
  }, [doc, layoutSV, meta, seamless, slideW]);

  useEffect(() => {
    selectedSV.set(selectedFrameId);
  }, [selectedFrameId, selectedSV]);

  // Camera: collages fit the view; seamless starts on slide 1 at full height,
  // then keeps the user's zoom and scroll within limits as things change.
  const camReady = useRef(false);
  useLayoutEffect(() => {
    if (!view.w || !view.h) return;
    viewSV.set(view);
    if (!seamless) {
      const fit = fitCamera(view.w, view.h, size.width, size.height, PAD);
      cam.set(fit);
      limits.set({ min: fit.s, max: fit.s });
      return;
    }
    const range = seamlessZoomRange(view.w, view.h, slideW, size.height, doc.slides, PAD);
    limits.set(range);
    const prev = cam.get();
    const next = camReady.current ? { s: clamp(prev.s, range.min, range.max), tx: prev.tx, ty: 0 } : { s: range.max, tx: PAD, ty: 0 };
    camReady.current = true;
    cam.set(clampCamera(next, view.w, view.h, size.width, size.height, PAD));
  }, [view, seamless, size.width, size.height, slideW, doc.slides, cam, limits, viewSV]);

  // ---- Callbacks to JS. Keep them stable (useCallback) so gestures are not rebuilt.
  const { onTapFrame: jsTap, onDoubleTapFrame: jsDouble, onCommitCrop: jsCrop, onCommitRect: jsRect, onSwap: jsSwap } = props;

  useImperativeHandle(
    props.apiRef,
    () => ({
      currentSlide: () => {
        const c = cam.get();
        const cx = (viewSV.get().w / 2 - c.tx) / c.s;
        return clamp(Math.floor(cx / slideW), 0, doc.slides - 1);
      },
    }),
    [cam, viewSV, slideW, doc.slides],
  );

  // ---- Gestures ------------------------------------------------------------
  const gesture = useMemo(() => {
    const setFrame = (index: number, patch: Partial<LiveFrame>) => {
      'worklet';
      const arr = framesSV.get().slice();
      if (!arr[index]) return;
      arr[index] = { ...arr[index], ...patch };
      framesSV.set(arr);
    };

    /** Decide what a gesture starting at a view point manipulates. */
    const begin = (x: number, y: number, tx: number, ty: number) => {
      'worklet';
      const c = cam.get();
      const L = layoutSV.get();
      const frames = framesSV.get();
      const p = toCanvas(c, x, y);
      const sel = selectedSV.get();
      const selIndex = sel ? frames.findIndex((f) => f.id === sel) : -1;
      const next: GState = { ...g.get(), tx0: tx, ty0: ty, anchor: p, startCam: c, snapped: false };

      if (selIndex >= 0 && frames[selIndex].free) {
        const box = frameBox(frames[selIndex].rect, L, true);
        for (let k = 0; k < 4; k++) {
          const cp = cornerPoint(box, k as Corner);
          const vx = cp.x * c.s + c.tx;
          const vy = cp.y * c.s + c.ty;
          if (Math.hypot(vx - x, vy - y) < HANDLE_HIT) {
            g.set({ ...next, mode: 'resize', index: selIndex, corner: k as Corner, startRect: frames[selIndex].rect, origRect: frames[selIndex].rect });
            return;
          }
        }
        const mx = (box.x + box.width / 2) * c.s + c.tx;
        const my = box.y * c.s + c.ty - MOVE_HANDLE_OFFSET;
        if (Math.hypot(mx - x, my - y) < HANDLE_HIT) {
          g.set({ ...next, mode: 'move', index: selIndex, startRect: frames[selIndex].rect, origRect: frames[selIndex].rect });
          return;
        }
      }

      const idx = hitTestFrame(frames, L, p);
      if (idx >= 0 && frames[idx].hasPhoto) {
        g.set({ ...next, mode: 'photo', index: idx, startCrop: frames[idx].crop, origCrop: frames[idx].crop });
        return;
      }
      g.set({ ...next, mode: meta.get().seamless ? 'canvas' : 'none', index: -1 });
    };

    const finish = () => {
      'worklet';
      const s = g.get();
      const f = framesSV.get()[s.index];
      // Only real changes become undo steps (and mark a collage unfinished again).
      if (f && s.mode === 'photo') {
        const box = frameBox(f.rect, layoutSV.get(), f.free);
        const next = normalizeCrop(box, f.iw, f.ih, f.crop);
        if (!sameCrop(next, normalizeCrop(box, f.iw, f.ih, s.origCrop))) scheduleOnRN(jsCrop, f.id, next);
      } else if (f && (s.mode === 'move' || s.mode === 'resize')) {
        if (!sameRect(f.rect, s.origRect)) scheduleOnRN(jsRect, f.id, f.rect);
      }
      g.set({ ...IDLE });
    };

    const pan = Gesture.Pan()
      .minDistance(4)
      .onStart((e) => {
        if (g.get().active === 0) begin(e.x - e.translationX, e.y - e.translationY, e.translationX, e.translationY);
        g.set({ ...g.get(), active: g.get().active + 1 });
      })
      .onUpdate((e) => {
        const s = g.get();
        if (s.pinching) return;
        const c = cam.get();
        const L = layoutSV.get();
        if (s.rebasePan) {
          // A pinch just ended with a finger still down: continue from here.
          const f = framesSV.get()[s.index];
          g.set({
            ...s,
            rebasePan: false,
            tx0: e.translationX,
            ty0: e.translationY,
            anchor: toCanvas(c, e.x, e.y),
            startCrop: f ? f.crop : s.startCrop,
            startCam: c,
          });
          return;
        }
        const dx = (e.translationX - s.tx0) / c.s;
        const dy = (e.translationY - s.ty0) / c.s;
        if (s.mode === 'photo') {
          const f = framesSV.get()[s.index];
          if (!f) return;
          const box = frameBox(f.rect, L, f.free);
          const crop = gestureCrop(box, f.iw, f.ih, s.startCrop, s.anchor, { x: s.anchor.x + dx, y: s.anchor.y + dy }, 1);
          setFrame(s.index, { crop });
        } else if (s.mode === 'canvas') {
          const v = viewSV.get();
          cam.set(clampCamera(
            { s: s.startCam.s, tx: s.startCam.tx + (e.translationX - s.tx0), ty: s.startCam.ty },
            v.w,
            v.h,
            L.W,
            L.H,
            PAD,
          ));
        } else if (s.mode === 'move') {
          const r = moveFreeRect(s.startRect, dx, dy, L, meta.get().slides, 14 / c.s);
          if (r.snapped && !s.snapped) scheduleOnRN(haptic, 'select');
          if (r.snapped !== s.snapped) g.set({ ...s, snapped: r.snapped });
          setFrame(s.index, { rect: r.rect });
        } else if (s.mode === 'resize') {
          const u = L.W / meta.get().slides / 1080;
          setFrame(s.index, { rect: resizeFreeRect(s.startRect, s.corner, dx, dy, L, 80 * u) });
        }
      })
      .onEnd(() => {
        const active = g.get().active - 1;
        if (active <= 0) finish();
        else g.set({ ...g.get(), active });
      });

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        const s = g.get();
        if (s.active === 0) begin(e.focalX, e.focalY, 0, 0);
        const c = cam.get();
        const cur = g.get();
        const f = framesSV.get()[cur.index];
        g.set({
          ...cur,
          active: cur.active + 1,
          pinching: true,
          anchor: toCanvas(c, e.focalX, e.focalY),
          startCrop: f ? f.crop : cur.startCrop,
          startCam: c,
        });
      })
      .onUpdate((e) => {
        const s = g.get();
        const L = layoutSV.get();
        if (s.mode === 'photo') {
          const f = framesSV.get()[s.index];
          if (!f) return;
          const c = cam.get();
          const box = frameBox(f.rect, L, f.free);
          const point = toCanvas(c, e.focalX, e.focalY);
          setFrame(s.index, { crop: gestureCrop(box, f.iw, f.ih, s.startCrop, s.anchor, point, e.scale) });
        } else if (s.mode === 'canvas') {
          const lim = limits.get();
          const v = viewSV.get();
          const sNew = clamp(s.startCam.s * e.scale, lim.min, lim.max);
          // Keep the canvas point under the fingers fixed.
          const tx = e.focalX - s.anchor.x * sNew;
          cam.set(clampCamera({ s: sNew, tx, ty: 0 }, v.w, v.h, L.W, L.H, PAD));
        }
      })
      .onEnd(() => {
        const active = g.get().active - 1;
        if (active <= 0) finish();
        else g.set({ ...g.get(), active, pinching: false, rebasePan: true });
      });

    const tap = Gesture.Tap()
      .maxDuration(300)
      .onEnd((e, success) => {
        if (!success) return;
        const p = toCanvas(cam.get(), e.x, e.y);
        const frames = framesSV.get();
        const idx = hitTestFrame(frames, layoutSV.get(), p);
        if (idx < 0) scheduleOnRN(jsTap, null, false);
        else scheduleOnRN(jsTap, frames[idx].id, !frames[idx].hasPhoto);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e, success) => {
        if (!success) return;
        const frames = framesSV.get();
        const idx = hitTestFrame(frames, layoutSV.get(), toCanvas(cam.get(), e.x, e.y));
        if (idx >= 0 && frames[idx].hasPhoto) scheduleOnRN(jsDouble, frames[idx].id);
      });

    // P-8: long-press a photo, drag it onto another frame to swap.
    const swapPan = Gesture.Pan()
      .activateAfterLongPress(SWAP_DELAY_MS)
      .onTouchesDown((e, manager) => {
        // Only a press on a photo can become a swap; otherwise step aside so
        // a slow press-and-drag on the background still scrolls.
        const touch = e.allTouches[0];
        if (!touch) return;
        const frames = framesSV.get();
        const idx = hitTestFrame(frames, layoutSV.get(), toCanvas(cam.get(), touch.x, touch.y));
        if (idx < 0 || !frames[idx].hasPhoto) manager.fail();
      })
      .onStart((e) => {
        const frames = framesSV.get();
        const p = toCanvas(cam.get(), e.x, e.y);
        const idx = hitTestFrame(frames, layoutSV.get(), p);
        if (idx < 0 || !frames[idx].hasPhoto) return;
        swap.set({ active: true, from: idx, target: -1, x: p.x, y: p.y });
        scheduleOnRN(haptic, 'medium');
      })
      .onUpdate((e) => {
        if (!swap.get().active) return;
        const p = toCanvas(cam.get(), e.x, e.y);
        const idx = hitTestFrame(framesSV.get(), layoutSV.get(), p);
        const target = idx === swap.get().from ? -1 : idx;
        if (target !== swap.get().target && target >= 0) scheduleOnRN(haptic, 'select');
        swap.set({ ...swap.get(), x: p.x, y: p.y, target });
      })
      .onEnd(() => {
        const s = swap.get();
        const frames = framesSV.get();
        if (s.active && s.target >= 0 && frames[s.from] && frames[s.target]) {
          scheduleOnRN(jsSwap, frames[s.from].id, frames[s.target].id);
        }
      })
      .onFinalize(() => {
        swap.set({ active: false, from: -1, target: -1, x: 0, y: 0 });
      });

    return Gesture.Race(swapPan, Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(doubleTap, tap));
  }, [cam, framesSV, g, jsCrop, jsDouble, jsRect, jsSwap, jsTap, layoutSV, limits, meta, selectedSV, swap, viewSV]);

  // ---- Drawing -------------------------------------------------------------
  const camTransform = useDerivedValue(() => [
    { translateX: cam.get().tx },
    { translateY: cam.get().ty },
    { scale: cam.get().s },
  ]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setView({ w: Math.round(width), h: Math.round(height) });
  };

  const selectedFree = !!doc.frames.find((f) => f.id === selectedFrameId)?.free;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.fill} accessibilityLabel="Collage canvas" accessible>
          <Group transform={camTransform}>
            <Group clip={{ x: 0, y: 0, width: size.width, height: size.height }}>
              <BackgroundLayer
                background={doc.style.background}
                width={size.width}
                height={size.height}
                unit={unit}
                images={images}
              />
              {doc.frames.map((f) => (
                <LiveFrameNode
                  key={f.id}
                  id={f.id}
                  framesSV={framesSV}
                  layoutSV={layoutSV}
                  unit={unit}
                  image={f.photoId ? images[f.photoId] : undefined}
                  hasPhoto={!!f.photoId}
                  iw={f.photoId ? (doc.photos[f.photoId]?.width ?? 1) : 1}
                  ih={f.photoId ? (doc.photos[f.photoId]?.height ?? 1) : 1}
                />
              ))}
            </Group>
          </Group>
          {seamless && showSeams && (
            <SeamOverlay cam={cam} slides={doc.slides} slideW={slideW} height={size.height} />
          )}
          {!seamless && showSafeZone && doc.canvas.id === '9:16' && (
            <SafeZoneOverlay cam={cam} width={size.width} height={size.height} band={STORY_SAFE_ZONE * unit} />
          )}
          {selectedFrameId && (
            <SelectionOverlay
              id={selectedFrameId}
              free={selectedFree}
              framesSV={framesSV}
              layoutSV={layoutSV}
              cam={cam}
            />
          )}
          <SwapOverlay swap={swap} framesSV={framesSV} layoutSV={layoutSV} cam={cam} images={images} doc={doc} />
        </Canvas>
      </GestureDetector>
    </View>
  );
}

// ---- Drawing helpers --------------------------------------------------------

function toLiveFrames(doc: CollageDoc): LiveFrame[] {
  return doc.frames.map((f) => {
    const p = f.photoId ? doc.photos[f.photoId] : undefined;
    return { id: f.id, rect: f.rect, crop: f.crop, free: !!f.free, hasPhoto: !!p, iw: p?.width ?? 1, ih: p?.height ?? 1 };
  });
}

const ZERO: PRect = { x: 0, y: 0, width: 1, height: 1 };

function sameCrop(a: Crop, b: Crop): boolean {
  'worklet';
  const e = 1e-4;
  return (
    a.rotation === b.rotation &&
    a.flip === b.flip &&
    Math.abs(a.scale - b.scale) < e &&
    Math.abs(a.fx - b.fx) < e &&
    Math.abs(a.fy - b.fy) < e
  );
}

function sameRect(a: FRect, b: FRect): boolean {
  'worklet';
  const e = 1e-5;
  return Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e && Math.abs(a.w - b.w) < e && Math.abs(a.h - b.h) < e;
}

function findFrame(frames: LiveFrame[], id: string): LiveFrame | undefined {
  'worklet';
  for (let i = 0; i < frames.length; i++) if (frames[i].id === id) return frames[i];
  return undefined;
}

function LiveFrameNode({
  id,
  framesSV,
  layoutSV,
  unit,
  image,
  hasPhoto,
  iw,
  ih,
}: {
  id: string;
  framesSV: SharedValue<LiveFrame[]>;
  layoutSV: SharedValue<LayoutParams>;
  unit: number;
  image?: SkImage | null;
  hasPhoto: boolean;
  iw: number;
  ih: number;
}) {
  const box = useDerivedValue(() => {
    const f = findFrame(framesSV.value, id);
    return f ? frameBox(f.rect, layoutSV.value, f.free) : ZERO;
  });
  const clip = useDerivedValue(() => {
    const r = frameRadius(box.value, layoutSV.value.radius);
    return { rect: box.value, rx: r, ry: r };
  });
  const transform = useDerivedValue(() => {
    const f = findFrame(framesSV.value, id);
    return f && f.hasPhoto ? imageTransform(box.value, f.iw, f.ih, f.crop) : [];
  });
  const plus = useDerivedValue(() => {
    const b = box.value;
    const arm = Math.min(28 * unit, b.width / 5, b.height / 5);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return { cx, cy, arm };
  });
  const h1 = useDerivedValue(() => ({ x: plus.value.cx - plus.value.arm, y: plus.value.cy }));
  const h2 = useDerivedValue(() => ({ x: plus.value.cx + plus.value.arm, y: plus.value.cy }));
  const v1 = useDerivedValue(() => ({ x: plus.value.cx, y: plus.value.cy - plus.value.arm }));
  const v2 = useDerivedValue(() => ({ x: plus.value.cx, y: plus.value.cy + plus.value.arm }));

  if (hasPhoto && image) {
    return (
      <Group clip={clip}>
        <Group transform={transform}>
          <Image image={image} x={0} y={0} width={iw} height={ih} fit="fill" />
        </Group>
      </Group>
    );
  }
  return (
    <Group clip={clip}>
      <Rect rect={box} color={PLACEHOLDER_FILL} />
      {!hasPhoto && (
        <Group>
          <Line p1={h1} p2={h2} color={PLACEHOLDER_INK} strokeWidth={Math.max(2, 5 * unit)} strokeCap="round" />
          <Line p1={v1} p2={v2} color={PLACEHOLDER_INK} strokeWidth={Math.max(2, 5 * unit)} strokeCap="round" />
        </Group>
      )}
    </Group>
  );
}

/** Dashed cut lines and slide numbers (S-3), drawn in view space. */
function SeamOverlay({ cam, slides, slideW, height }: { cam: SharedValue<Camera>; slides: number; slideW: number; height: number }) {
  return (
    <Group>
      {Array.from({ length: slides }, (_, i) => (
        <SeamMark key={i} index={i} cam={cam} slideW={slideW} height={height} />
      ))}
    </Group>
  );
}

function SeamMark({ index, cam, slideW, height }: { index: number; cam: SharedValue<Camera>; slideW: number; height: number }) {
  const p1 = useDerivedValue(() => ({ x: cam.value.tx + index * slideW * cam.value.s, y: cam.value.ty }));
  const p2 = useDerivedValue(() => ({ x: cam.value.tx + index * slideW * cam.value.s, y: cam.value.ty + height * cam.value.s }));
  const label = String(index + 1);
  const labelW = font.measureText(label).width;
  const tx = useDerivedValue(() => cam.value.tx + (index + 0.5) * slideW * cam.value.s - labelW / 2);
  const ty = useDerivedValue(() => cam.value.ty - 6);
  return (
    <Group>
      {index > 0 && (
        <Group>
          <Line p1={p1} p2={p2} color="rgba(255,255,255,0.9)" strokeWidth={3} />
          <Line p1={p1} p2={p2} color="rgba(20,20,24,0.85)" strokeWidth={1.5}>
            <DashPathEffect intervals={[7, 5]} />
          </Line>
        </Group>
      )}
      <SkText x={tx} y={ty} text={label} font={font} color="#8E8E93" />
    </Group>
  );
}

/** Story safe zones (C-3): top and bottom ~250 px are covered by Instagram UI. */
function SafeZoneOverlay({ cam, width, height, band }: { cam: SharedValue<Camera>; width: number; height: number; band: number }) {
  const top = useDerivedValue(() => ({ x: cam.value.tx, y: cam.value.ty, width: width * cam.value.s, height: band * cam.value.s }));
  const bottom = useDerivedValue(() => ({
    x: cam.value.tx,
    y: cam.value.ty + (height - band) * cam.value.s,
    width: width * cam.value.s,
    height: band * cam.value.s,
  }));
  const l1a = useDerivedValue(() => ({ x: cam.value.tx, y: cam.value.ty + band * cam.value.s }));
  const l1b = useDerivedValue(() => ({ x: cam.value.tx + width * cam.value.s, y: cam.value.ty + band * cam.value.s }));
  const l2a = useDerivedValue(() => ({ x: cam.value.tx, y: cam.value.ty + (height - band) * cam.value.s }));
  const l2b = useDerivedValue(() => ({ x: cam.value.tx + width * cam.value.s, y: cam.value.ty + (height - band) * cam.value.s }));
  return (
    <Group>
      <Rect rect={top} color="rgba(0,0,0,0.18)" />
      <Rect rect={bottom} color="rgba(0,0,0,0.18)" />
      <Line p1={l1a} p2={l1b} color="rgba(255,255,255,0.95)" strokeWidth={1.5}>
        <DashPathEffect intervals={[6, 5]} />
      </Line>
      <Line p1={l2a} p2={l2b} color="rgba(255,255,255,0.95)" strokeWidth={1.5}>
        <DashPathEffect intervals={[6, 5]} />
      </Line>
    </Group>
  );
}

const SELECTION = '#2F7BF6';

/** Outline of the selected frame, plus move and resize handles for free frames (S-6). */
function SelectionOverlay({
  id,
  free,
  framesSV,
  layoutSV,
  cam,
}: {
  id: string;
  free: boolean;
  framesSV: SharedValue<LiveFrame[]>;
  layoutSV: SharedValue<LayoutParams>;
  cam: SharedValue<Camera>;
}) {
  const vbox = useDerivedValue(() => {
    const f = findFrame(framesSV.value, id);
    if (!f) return { x: -100, y: -100, width: 0, height: 0 };
    const b = frameBox(f.rect, layoutSV.value, f.free);
    const c = cam.value;
    return { x: b.x * c.s + c.tx, y: b.y * c.s + c.ty, width: b.width * c.s, height: b.height * c.s };
  });
  const outline = useDerivedValue(() => {
    const r = frameRadius(vbox.value, layoutSV.value.radius * cam.value.s);
    return { rect: vbox.value, rx: r, ry: r };
  });
  return (
    <Group>
      <RoundedRect rect={outline} color={SELECTION} style="stroke" strokeWidth={2.5} />
      {free && (
        <Group>
          {[0, 1, 2, 3].map((k) => (
            <CornerHandle key={k} corner={k as Corner} vbox={vbox} />
          ))}
          <MoveHandle vbox={vbox} />
        </Group>
      )}
    </Group>
  );
}

function CornerHandle({ corner, vbox }: { corner: Corner; vbox: SharedValue<PRect> }) {
  const rect = useDerivedValue(() => {
    const p = cornerPoint(vbox.value, corner);
    return { rect: { x: p.x - 8, y: p.y - 8, width: 16, height: 16 }, rx: 8, ry: 8 };
  });
  return (
    <Group>
      <RoundedRect rect={rect} color="#FFFFFF" />
      <RoundedRect rect={rect} color={SELECTION} style="stroke" strokeWidth={2.5} />
    </Group>
  );
}

function MoveHandle({ vbox }: { vbox: SharedValue<PRect> }) {
  const rect = useDerivedValue(() => ({
    x: vbox.value.x + vbox.value.width / 2 - 22,
    y: vbox.value.y - MOVE_HANDLE_OFFSET - 9,
    width: 44,
    height: 18,
  }));
  const pill = useDerivedValue(() => ({ rect: rect.value, rx: 9, ry: 9 }));
  const l1 = useDerivedValue(() => ({ x: rect.value.x + 12, y: rect.value.y + 7 }));
  const l2 = useDerivedValue(() => ({ x: rect.value.x + 32, y: rect.value.y + 7 }));
  const l3 = useDerivedValue(() => ({ x: rect.value.x + 12, y: rect.value.y + 11 }));
  const l4 = useDerivedValue(() => ({ x: rect.value.x + 32, y: rect.value.y + 11 }));
  return (
    <Group>
      <RoundedRect rect={pill} color={SELECTION} />
      <Line p1={l1} p2={l2} color="#FFFFFF" strokeWidth={1.5} strokeCap="round" />
      <Line p1={l3} p2={l4} color="#FFFFFF" strokeWidth={1.5} strokeCap="round" />
    </Group>
  );
}

/** Drop-target highlight and a floating thumbnail while swapping photos (P-8). */
function SwapOverlay({
  swap,
  framesSV,
  layoutSV,
  cam,
  images,
  doc,
}: {
  swap: SharedValue<SwapState>;
  framesSV: SharedValue<LiveFrame[]>;
  layoutSV: SharedValue<LayoutParams>;
  cam: SharedValue<Camera>;
  images: ImageMap;
  doc: CollageDoc;
}) {
  const target = useDerivedValue(() => {
    const s = swap.value;
    const f = s.active && s.target >= 0 ? framesSV.value[s.target] : undefined;
    if (!f) return { x: -100, y: -100, width: 0, height: 0 };
    const b = frameBox(f.rect, layoutSV.value, f.free);
    const c = cam.value;
    return { x: b.x * c.s + c.tx, y: b.y * c.s + c.ty, width: b.width * c.s, height: b.height * c.s };
  });
  const ghost = useDerivedValue(() => {
    const s = swap.value;
    if (!s.active) return { x: -200, y: -200, width: 0, height: 0 };
    const c = cam.value;
    return { x: s.x * c.s + c.tx - 36, y: s.y * c.s + c.ty - 36, width: 72, height: 72 };
  });
  const ghostClip = useDerivedValue(() => ({ rect: ghost.value, rx: 12, ry: 12 }));
  const targetOutline = useDerivedValue(() => ({ rect: target.value, rx: 6, ry: 6 }));
  const ghostOpacity = useDerivedValue(() => (swap.value.active ? 0.92 : 0));

  // Which photo is being dragged changes once per drag; React picks its image.
  const [from, setFrom] = useState(-1);
  useAnimatedReaction(
    () => swap.value.from,
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setFrom, cur);
    },
  );
  const frame = from >= 0 ? doc.frames[from] : undefined;
  const image = frame?.photoId ? images[frame.photoId] : undefined;

  return (
    <Group>
      <RoundedRect rect={targetOutline} color={SELECTION} style="stroke" strokeWidth={4} />
      <Group opacity={ghostOpacity}>
        <Group clip={ghostClip}>
          {image ? (
            <Image image={image} rect={ghost} fit="cover" />
          ) : (
            <Rect rect={ghost} color={PLACEHOLDER_FILL} />
          )}
        </Group>
        <RoundedRect rect={ghostClip} color="#FFFFFF" style="stroke" strokeWidth={3} />
      </Group>
    </Group>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
