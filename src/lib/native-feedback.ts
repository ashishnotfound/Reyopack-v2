"use client";

import { Capacitor } from "@capacitor/core";

export async function vibrateScanDetected() {
  if (!Capacitor.isNativePlatform()) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

export async function vibratePackingSuccess() {
  if (!Capacitor.isNativePlatform()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
}

export async function vibrateError() {
  if (!Capacitor.isNativePlatform()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  await Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
}
