"use client";

import { useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeToConnection, getOnlineSnapshot, getServerOnlineSnapshot);

  return (
    <div
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
        online ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive"
      }`}
    >
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {online ? "CONNECTED" : "CONNECTION LOST"}
    </div>
  );
}

function subscribeToConnection(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}
