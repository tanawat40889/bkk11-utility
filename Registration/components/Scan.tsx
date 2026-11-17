"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { Close } from "./icons";

// camera barcode/QR reader; calls onCode once with the member code (first 8-digit run, else all digits)
export default function Scan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const cb = useRef({ onCode, onClose });
  cb.current = { onCode, onClose };

  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    (async () => {
      try {
        const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video.current!,
          (res, _e, ctl) => {
            if (!res || dead) return;
            const t = res.getText();
            const code = t.match(/\d{8}/)?.[0] ?? t.replace(/\D/g, "");
            if (!code) return;
            dead = true;
            ctl.stop();
            if (navigator.vibrate) navigator.vibrate(40);
            cb.current.onCode(code);
          },
        );
        if (dead) c.stop(); else stop = () => c.stop();
      } catch {
        setErr("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์");
      }
    })();
    return () => { dead = true; stop?.(); };
  }, []);

  return (
    <div className="scan" role="dialog" aria-label="สแกนบาร์โค้ด">
      <video ref={video} muted playsInline />
      <div className="frame" aria-hidden />
      <p className="scan-msg">{err || "ถือให้บาร์โค้ดอยู่ในกรอบ"}</p>
      <button className="btn icon scan-x" aria-label="ปิด" onClick={() => cb.current.onClose()}><Close /></button>
    </div>
  );
}
