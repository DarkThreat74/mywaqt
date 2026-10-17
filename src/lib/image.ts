/** Client-side image compression.
 *  WebP is ~30% smaller than JPEG at equal visual quality, so we can keep a
 *  much larger resolution for roughly the same payload. If a browser can't
 *  encode WebP, canvas.toDataURL silently returns PNG — detected and retried
 *  as JPEG. EXIF orientation is honored where the platform supports it. */
export async function compressImage(
  file: Blob,
  maxDim = 1024,
  quality = 0.82,
): Promise<{ data: string; mime: string; dataUrl: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let dataUrl = canvas.toDataURL("image/webp", quality);
  let mime = "image/webp";
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    mime = "image/jpeg";
  }
  return { data: dataUrl.split(",")[1], mime, dataUrl };
}
