import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import React from 'react';
import type { ColorValue } from 'react-native';

/** Semantic icon names mapped to SF Symbols (iOS) and Material Symbols (Android). */
const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  redo: { ios: 'arrow.uturn.forward', android: 'redo' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  save: { ios: 'square.and.arrow.down', android: 'download' },
  replace: { ios: 'photo.badge.plus', android: 'add_photo_alternate' },
  rotate: { ios: 'rotate.right', android: 'rotate_right' },
  flip: { ios: 'arrow.left.and.right', android: 'flip' },
  remove: { ios: 'minus.circle', android: 'remove_circle_outline' },
  trash: { ios: 'trash', android: 'delete' },
  plus: { ios: 'plus', android: 'add' },
  photos: { ios: 'photo.on.rectangle.angled', android: 'photo_library' },
  layout: { ios: 'square.grid.2x2', android: 'grid_view' },
  border: { ios: 'square.dashed', android: 'border_style' },
  background: { ios: 'paintpalette', android: 'palette' },
  slides: { ios: 'rectangle.split.3x1', android: 'view_carousel' },
  preview: { ios: 'iphone', android: 'smartphone' },
  link: { ios: 'link', android: 'link' },
  forward: { ios: 'square.2.layers.3d.top.filled', android: 'flip_to_front' },
  backward: { ios: 'square.2.layers.3d.bottom.filled', android: 'flip_to_back' },
  splitRow: { ios: 'rectangle.split.2x1', android: 'vertical_split' },
  splitCol: { ios: 'rectangle.split.1x2', android: 'horizontal_split' },
  merge: { ios: 'rectangle.compress.vertical', android: 'merge' },
  collages: { ios: 'square.stack', android: 'collections' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  edit: { ios: 'pencil', android: 'edit' },
  duplicate: { ios: 'plus.square.on.square', android: 'content_copy' },
  frame: { ios: 'plus.rectangle', android: 'add_box' },
  seams: { ios: 'line.3.horizontal.decrease', android: 'view_week' },
  safeZone: { ios: 'rectangle.inset.filled', android: 'crop_free' },
  custom: { ios: 'slider.horizontal.3', android: 'tune' },
  eyedropper: { ios: 'eyedropper', android: 'colorize' },
  open: { ios: 'arrow.up.right.square', android: 'open_in_new' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} weight="medium" accessible={false} />;
}
