import * as Haptics from 'expo-haptics';

type Kind = 'select' | 'light' | 'medium' | 'success' | 'warning';

/** Fire-and-forget haptic feedback; failures (e.g. simulator) are ignored. */
export function haptic(kind: Kind): void {
  const p =
    kind === 'select'
      ? Haptics.selectionAsync()
      : kind === 'light'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : kind === 'medium'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          : Haptics.notificationAsync(
              kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
            );
  p.catch(() => {});
}
