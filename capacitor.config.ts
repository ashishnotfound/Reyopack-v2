import type { CapacitorConfig } from "@capacitor/cli";

const productionUrl = process.env.CAPACITOR_SERVER_URL?.trim()
  || "https://reyopack-v2.vercel.app/pack";

if (!productionUrl.startsWith("https://")) {
  throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
}

const config: CapacitorConfig = {
  appId: "com.reyo.pack",
  appName: "Reyo Pack",
  webDir: "mobile-shell",
  backgroundColor: "#07150f",
  loggingBehavior: "debug",
  appendUserAgent: " ReyoPackAndroid/1.1",
  android: {
    allowMixedContent: false,
    backgroundColor: "#07150f",
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    url: productionUrl,
    androidScheme: "https",
    cleartext: false,
    errorPath: "offline.html",
  },
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 400,
      backgroundColor: "#07150f",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
