"use client";

import { useCallback, useSyncExternalStore } from "react";

const notificationSoundVolumeStorageKey = "winpay-notice-sound-volume";
const notificationSoundVolumeEventName = "winpay-notice-sound-volume-change";

export const defaultNotificationSoundVolume = 1;
let fallbackNotificationSoundVolume = defaultNotificationSoundVolume;

function normalizeVolume(value: number) {
  if (!Number.isFinite(value)) {
    return defaultNotificationSoundVolume;
  }

  return Math.min(1, Math.max(0, value));
}

export function getNotificationSoundVolume() {
  if (typeof window === "undefined") {
    return defaultNotificationSoundVolume;
  }

  try {
    const storedValue = window.localStorage.getItem(
      notificationSoundVolumeStorageKey,
    );

    if (storedValue === null) {
      return fallbackNotificationSoundVolume;
    }

    fallbackNotificationSoundVolume = normalizeVolume(Number(storedValue));
    return fallbackNotificationSoundVolume;
  } catch {
    return fallbackNotificationSoundVolume;
  }
}

function subscribeToNotificationSoundVolume(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === notificationSoundVolumeStorageKey) {
      onStoreChange();
    }
  }

  window.addEventListener(notificationSoundVolumeEventName, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(notificationSoundVolumeEventName, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function setNotificationSoundVolume(value: number) {
  const nextVolume = normalizeVolume(value);
  fallbackNotificationSoundVolume = nextVolume;

  try {
    window.localStorage.setItem(
      notificationSoundVolumeStorageKey,
      String(nextVolume),
    );
  } catch {
    // Keep the current tab usable when local storage is unavailable.
  }

  window.dispatchEvent(new Event(notificationSoundVolumeEventName));
}

export function useNotificationSoundVolume() {
  const volume = useSyncExternalStore(
    subscribeToNotificationSoundVolume,
    getNotificationSoundVolume,
    () => defaultNotificationSoundVolume,
  );
  const updateVolume = useCallback((value: number) => {
    setNotificationSoundVolume(value);
  }, []);

  return { volume, updateVolume };
}
