"use client";

import { useSyncExternalStore } from "react";

const storageKey = "reyo-pack-sound";
const changeEvent = "reyo-pack-sound-change";

export function useSoundPreference() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setSoundPreference(enabled: boolean) {
  localStorage.setItem(storageKey, enabled ? "on" : "off");
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(changeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(changeEvent, onStoreChange);
  };
}

function getSnapshot() {
  return localStorage.getItem(storageKey) !== "off";
}

function getServerSnapshot() {
  return true;
}
