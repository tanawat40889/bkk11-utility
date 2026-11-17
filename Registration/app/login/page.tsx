"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";
import { asset } from "@/lib/base";

export default function Login() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/checkin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.session) throw new Error(res.status >= 500 ? "เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง" : (j?.error ?? "เข้าสู่ระบบไม่สำเร็จ"));
      const { error } = await sbBrowser().auth.setSession({
        access_token: j.session.access_token,
        refresh_token: j.session.refresh_token,
      });
      if (error) throw new Error("เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง");
      r.push("/events");
      r.refresh();
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    }
  }

  return (
    <main className="auth">
      <div>
        <div className="mark"><img src={asset("/logo.png")} alt="BKK11 รวมภาคกรุงเทพ" /></div>
        <h1 style={{ marginTop: 20 }}>เข้าสู่ระบบ</h1>
        <p className="sub">กรอกรหัสสมาชิกของคุณ</p>
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">รหัสสมาชิก</label>
          <input
            id="code"
            className="input code"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {err && <p className="msg bad" role="alert">{err}</p>}
        <button className="btn block" disabled={busy || !code}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      </form>
    </main>
  );
}
