"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";
import { dayNum, fmtMonth, fmtShort, todayLocal } from "@/lib/dates";
import Top from "@/components/Top";
import { Chev, Plus } from "@/components/icons";

type Ev = { id: string; name: string; event_date: string; last_date: string; rounds: number; n: number };

export default function Events() {
  const r = useRouter();
  const rr = useRef(r);
  rr.current = r;
  const [evs, setEvs] = useState<Ev[] | null>(null);
  const [name, setName] = useState("");
  const [dates, setDates] = useState<string[]>(() => [todayLocal()]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);

  const load = useCallback(async () => {
    const db = sbBrowser();
    const { data: s } = await db.auth.getSession();
    if (!s.session) return rr.current.replace("/login");
    const { data, error } = await db.rpc("checkin_events_list");
    if (error) return setEvs(null), setErr("ไม่มีสิทธิ์เข้าใช้งาน หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    setEvs((data as Ev[]) ?? []);
    const { data: a } = await db.rpc("checkin_is_admin");
    setAdmin(a === true);
  }, []);
  useEffect(() => { load(); }, [load]);

  // changing the number of sessions grows/shrinks the date list; new sessions copy the last date
  function setCount(v: string) {
    const n = Math.max(1, Math.min(20, Number(v) || 1));
    setDates((d) => (n <= d.length ? d.slice(0, n) : [...d, ...Array(n - d.length).fill(d[d.length - 1])]));
  }
  const setDateAt = (i: number, v: string) => setDates((d) => d.map((x, j) => (j === i ? v : x)));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await sbBrowser().rpc("checkin_event_create", { p_name: name, p_dates: dates });
    if (error) return setErr("สร้างกิจกรรมไม่สำเร็จ ลองอีกครั้ง");
    setName("");
    setDates([todayLocal()]);
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

        {admin && (
        <details className="create" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary><Plus /> สร้างกิจกรรมใหม่</summary>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="n">ชื่อกิจกรรม</label>
              <input id="n" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rd">จำนวนครั้งที่เช็คชื่อ</label>
              <input id="rd" className="input" type="number" inputMode="numeric" min={1} max={20} required value={dates.length} onChange={(e) => setCount(e.target.value)} />
              <span className="hint">ถ้าต้องเข้าหลายครั้ง เช่น 4–5 ครั้ง ใส่จำนวนที่นี่ แล้วเลือกวันที่ของแต่ละครั้ง</span>
            </div>
            {dates.map((d, i) => (
              <div className="field" key={i}>
                <label htmlFor={`d${i}`}>{dates.length > 1 ? `ครั้งที่ ${i + 1} วันที่` : "วันที่"}</label>
                <input id={`d${i}`} className="input" type="date" required value={d} onChange={(e) => setDateAt(i, e.target.value)} />
              </div>
            ))}
            {err && <p className="msg bad" role="alert">{err}</p>}
            <button className="btn block">สร้างกิจกรรม</button>
          </form>
        </details>
        )}

        {evs === null ? (
          err ? <p className="msg bad" role="alert">{err}</p> : <p className="sub">กำลังโหลด…</p>
        ) : evs.length === 0 ? (
          <p className="empty">ยังไม่มีกิจกรรม{admin ? <><br />กด “สร้างกิจกรรมใหม่” เพื่อเริ่มต้น</> : null}</p>
        ) : (
          <ul className="list">
            {evs.map((e) => (
              <li key={e.id}>
                <Link className="ev" href={`/event?id=${e.id}`}>
                  <div className="date"><div className="d num">{dayNum(e.event_date)}</div><div className="m">{fmtMonth(e.event_date)}</div></div>
                  <div className="t">
                    <strong>{e.name}</strong>
                    <span className="num">
                      {e.rounds > 1
                        ? `${e.rounds} ครั้ง · ${fmtShort(e.event_date)}${e.last_date !== e.event_date ? ` – ${fmtShort(e.last_date)}` : ""}`
                        : "1 ครั้ง"}
                    </span>
                    <span className="num">เช็คชื่อแล้ว {e.n} {e.rounds > 1 ? "ครั้ง" : "คน"}</span>
                  </div>
                  <Chev />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
