"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";
import Top from "@/components/Top";
import { Chev, Plus } from "@/components/icons";

type Ev = { id: string; name: string; event_date: string; rounds: number; n: number };

const th = (d: string) => {
  const x = new Date(d + "T00:00:00");
  return { d: x.getDate(), m: x.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }) };
};

export default function Events() {
  const r = useRouter();
  const rr = useRef(r);
  rr.current = r;
  const [evs, setEvs] = useState<Ev[] | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rounds, setRounds] = useState("1");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const db = sbBrowser();
    const { data: u } = await db.auth.getUser();
    if (!u.user) return rr.current.replace("/login");
    const { data, error } = await db.rpc("checkin_events_list");
    if (error) return setEvs(null), setErr("ไม่มีสิทธิ์เข้าใช้งาน หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    setEvs((data as Ev[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const db = sbBrowser();
    const { error } = await db.rpc("checkin_event_create", { p_name: name, p_date: date, p_rounds: Math.max(1, Math.min(20, Number(rounds) || 1)) });
    if (error) return setErr("สร้างกิจกรรมไม่สำเร็จ ลองอีกครั้ง");
    setName("");
    setRounds("1");
    setOpen(false);
    load();
  }

  return (
    <>
      <Top />
      <main className="page">
        <div>
          <h1>กิจกรรม</h1>
          <p className="sub">เลือกกิจกรรมเพื่อเริ่มเช็คชื่อ</p>
        </div>

        <details className="create" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary><Plus /> สร้างกิจกรรมใหม่</summary>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="n">ชื่อกิจกรรม</label>
              <input id="n" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dt">วันที่</label>
              <input id="dt" className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rd">จำนวนรอบเช็คชื่อ</label>
              <input id="rd" className="input" type="number" inputMode="numeric" min={1} max={20} required value={rounds} onChange={(e) => setRounds(e.target.value)} />
              <span className="hint">ถ้ากิจกรรมนี้ต้องเช็คชื่อหลายครั้ง เช่น 4–5 รอบ ใส่จำนวนรอบที่นี่ เพิ่มทีหลังได้</span>
            </div>
            {err && <p className="msg bad" role="alert">{err}</p>}
            <button className="btn block">สร้างกิจกรรม</button>
          </form>
        </details>

        {evs === null ? (
          err ? <p className="msg bad" role="alert">{err}</p> : <p className="sub">กำลังโหลด…</p>
        ) : evs.length === 0 ? (
          <p className="empty">ยังไม่มีกิจกรรม<br />กด “สร้างกิจกรรมใหม่” เพื่อเริ่มต้น</p>
        ) : (
          <ul className="list">
            {evs.map((e) => {
              const t = th(e.event_date);
              return (
                <li key={e.id}>
                  <Link className="ev" href={`/event?id=${e.id}`}>
                    <div className="date"><div className="d num">{t.d}</div><div className="m">{t.m}</div></div>
                    <div className="t">
                      <strong>{e.name}</strong>
                      <span className="num">{e.rounds > 1 ? `${e.rounds} รอบ · เช็คชื่อแล้ว ${e.n} ครั้ง` : `เช็คชื่อแล้ว ${e.n} คน`}</span>
                    </div>
                    <Chev />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
