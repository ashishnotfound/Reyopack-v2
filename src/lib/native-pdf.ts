import { Capacitor } from "@capacitor/core";

export async function shareNativePdf(bytes: Uint8Array, mode: 1 | 4) {
  if (!Capacitor.isNativePlatform()) return false;
  if (
    !Capacitor.isPluginAvailable("Filesystem") ||
    !Capacitor.isPluginAvailable("Share")
  )
    throw new Error(
      "Install the updated Reyo Pack APK to save/share PDFs from Android.",
    );
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not prepare PDF file."));
    reader.readAsDataURL(
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    );
  });
  const file = await Filesystem.writeFile({
    directory: Directory.Cache,
    path: `reyo-labels/Reyo-Pack-${mode}-per-A4-${crypto.randomUUID()}.pdf`,
    data: base64,
    recursive: true,
  });
  await Share.share({
    title: "Reyo Pack shipping labels",
    files: [file.uri],
    dialogTitle: "Save or open shipping labels",
  });
  return true;
}
