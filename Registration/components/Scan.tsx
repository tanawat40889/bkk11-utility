"use client";
import { useEffect, useRef, useState } from "react";
import {
  BarcodeFormat, BinaryBitmap, CodaBarReader, DecodeHintType, GlobalHistogramBinarizer, HybridBinarizer,
  MultiFormatReader, RGBLuminanceSource,
} from "@zxing/library";
import { Close } from "./icons";

// Member cards carry a Codabar barcode (A66552126A). zxing's multi-format reader misses it when the barcode is a small
// part of a busy frame, so: crop the frame to the on-screen guide box, try CodaBarReader first, then other formats.
const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.ITF, BarcodeFormat.QR_CODE]],
]);

function decode(img: ImageData): string | null {
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, d = img.data; i < lum.length; i++) lum[i] = (d[i * 4] * 306 + d[i * 4 + 1] * 601 + d[i * 4 + 2] * 117) >> 10;
  const src = new RGBLuminanceSource(lum, img.width, img.height);
  for (const Bin of [HybridBinarizer, GlobalHistogramBinarizer]) {
    const bmp = new BinaryBitmap(new Bin(src));
    try { return new CodaBarReader().decode(bmp, hints).getText(); } catch {}
    try {
      const m = new MultiFormatReader();
      m.setHints(hints);
      return m.decode(bmp).getText();
    } catch {}
  }
  return null;
}

// member code = first 8-digit run, else every digit
const toCode = (t: string) => t.match(/\d{8}/)?.[0] ?? t.replace(/\D/g, "");

export default function Scan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const cb = useRef({ onCode, onClose });
  cb.current = { onCode, onClose };

  useEffect(() => {
    let dead = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    function tick() {
      const v = video.current, f = frame.current;
      if (dead || !v || !f) return;
      if (v.videoWidth && v.readyState >= 2) {
        // guide box (screen px) -> video px, accounting for object-fit: cover; +12% margin
        const box = v.getBoundingClientRect(), r = f.getBoundingClientRect();
        const k = Math.max(box.width / v.videoWidth, box.height / v.videoHeight);
        const ox = (v.videoWidth * k - box.width) / 2, oy = (v.videoHeight * k - box.height) / 2;
        const mx = r.width * 0.12, my = r.height * 0.12;
        const sx = Math.max(0, (r.left - box.left - mx + ox) / k), sy = Math.max(0, (r.top - box.top - my + oy) / k);
        const sw = Math.min(v.videoWidth - sx, (r.width + 2 * mx) / k), sh = Math.min(v.videoHeight - sy, (r.height + 2 * my) / k);
        const s = Math.min(1, 1400 / sw);
        canvas.width = Math.round(sw * s);
        canvas.height = Math.round(sh * s);
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const t = decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const code = t ? toCode(t) : "";
        if (code) {
          dead = true;
          if (navigator.vibrate) navigator.vibrate(40);
          stream?.getTracks().forEach((x) => x.stop());
          cb.current.onCode(code);
          return;
        }
      }
      timer = setTimeout(tick, 90);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (dead) return stream.getTracks().forEach((x) => x.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        tick();
      } catch {
        setErr("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์");
      }
    })();

    return () => {
      dead = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, []);

  return (
    <div className="scan" role="dialog" aria-label="สแกนบาร์โค้ด">
      <video ref={video} muted playsInline />
      <div className="frame" ref={frame} aria-hidden />
      <p className="scan-msg">{err || "วางบาร์โค้ดให้อยู่ในกรอบ"}</p>
      <button className="btn icon scan-x" aria-label="ปิด" onClick={() => cb.current.onClose()}><Close /></button>
    </div>
  );
}
