"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";
import Top from "@/components/Top";
import { fmtLong, fmtShort, todayLocal } from "@/lib/dates";
import { Back, Check, Gear, Search, Undo } from "@/components/icons";

type M = { mt_co: number; name: string; khet: string };
type C = M & { checked_in_at: string };
type Ev = { name: string; event_date: string; rounds: number; round_dates: string[]; counts: number[]; level: string; scope: string };

export default function Page() {
  return (
    <Suspense fallback={<><Top /><main className="page"><p className="sub">กำลังโหลด…</p></main></>}>
      <CheckIn />
    </Suspense>
  );
}

function CheckIn() {
  const id = useSearchParams().get("id") ?? "";
  const r = useRouter();
  const rr = useRef(r);
  rr.current = r;
  const [ev, setEv] = useState<Ev | null | undefined>(undefined);
  const [round, setRound] = useState(1);
  const [done, setDone] = useState<C[]>([]);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<M[]>([]);
  const [resFor, setResFor] = useState("");
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [showSet, setShowSet] = useState(false);
  const [prev, setPrev] = useState<C[]>([]);
  const [toast, setToast] = useState<{ code: number; name: string; round: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const key = `bkk11-round-${id}`;

  const inited = useRef(false);
  const pick = (n: number) => {
    setRound(n);
    setQ("");
    setToast(null);
    try { localStorage.setItem(key, String(n)); } catch {}
  };

  const load = useCallback(async () => {
    const db = sbBrowser();
    const { data: s } = await db.auth.getSession();
    if (!s.session) return rr.current.replace("/login");
    if (!id) return setEv(null);
    const { data: e } = await db.rpc("checkin_event_get", { p_id: id });
    const row = (e?.[0] as Ev | undefined) ?? null;
    setEv(row);
    if (!row) return;
    let cur = Math.min(round, row.rounds);
    if (!inited.current) {
      // first open: pick the ครั้ง whose date is today (the one remembered on this device wins if several share today);
      // otherwise the remembered one, otherwise the nearest date
      inited.current = true;
      let remembered = 0;
      try { remembered = Number(localStorage.getItem(key)) || 0; } catch {}
      const today = todayLocal();
      const todays = row.round_dates.flatMap((d, i) => (d === today ? [i + 1] : []));
      const nearest = () => {
        const t = new Date(`${today}T00:00:00`).getTime();
        let best = 1, gap = Infinity;
        row.round_dates.forEach((d, i) => {
          const g = Math.abs(new Date(`${d}T00:00:00`).getTime() - t);
          if (g < gap) { gap = g; best = i + 1; }
        });
        return best;
      };
      cur = todays.includes(remembered) ? remembered : todays[0] ?? (remembered >= 1 && remembered <= row.rounds ? remembered : nearest());
      setRound(cur);
    }
    const { data: c } = await db.rpc("checkin_list", { p_event: id, p_round: cur });
    setDone((c as C[]) ?? []);
    if (cur > 1) {
      const { data: p } = await db.rpc("checkin_list", { p_event: id, p_round: cur - 1 });
      setPrev(((p as C[]) ?? []).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "th")));
    } else setPrev([]);
    const { data: a } = await db.rpc("checkin_is_admin");
    setAdmin(a === true);
  }, [id, round, key]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setRes([]); setResFor(""); return; }
    const h = setTimeout(async () => {
      const { data } = await sbBrowser().rpc("checkin_search", { p_event: id, p_q: t });
      setRes((data as M[]) ?? []);
      setResFor(t);
    }, 200);
    return () => clearTimeout(h);
  }, [q, id]);

  const cur = ev ? Math.min(round, ev.rounds) : 1;

  async function mark(m: M) {
    setErr("");
    const { error } = await sbBrowser().rpc("checkin_mark", { p_event: id, p_round: cur, p_mt: m.mt_co });
    if (error) return setErr("เช็คชื่อไม่สำเร็จ ลองอีกครั้ง");
    setQ("");
    setToast({ code: m.mt_co, name: m.name, round: cur });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
    input.current?.focus();
    load();
  }

  async function undo(code: number, rd = cur) {
    await sbBrowser().rpc("checkin_undo", { p_event: id, p_round: rd, p_mt: code });
    if (toast?.code === code) setToast(null);
    load();
  }

  async function addRound() {
    const { data, error } = await sbBrowser().rpc("checkin_round_add", { p_event: id, p_date: adding ?? todayLocal() });
    if (error) return setErr("เพิ่มครั้งไม่ได้ (สูงสุด 20 ครั้ง)");
    setAdding(null);
    setShowSet(false);
    pick(data as number);
  }

  async function changeLevel(l: string) {
    const { error } = await sbBrowser().rpc("checkin_event_set_level", { p_event: id, p_level: l });
    if (error) return setErr("เปลี่ยนระดับไม่สำเร็จ ลองอีกครั้ง");
    setQ("");
    load();
  }

  async function changeDate(v: string) {
    if (!v) return;
    const { error } = await sbBrowser().rpc("checkin_round_set_date", { p_event: id, p_round: cur, p_date: v });
    if (error) return setErr("แก้วันที่ไม่สำเร็จ ลองอีกครั้ง");
    load();
  }

  const doneSet = new Set(done.map((d) => d.mt_co));
  const pending = prev.filter((p) => !doneSet.has(p.mt_co));
  if (ev === undefined) return <><Top /><main className="page"><p className="sub">กำลังโหลด…</p></main></>;
  if (ev === null)
    return <><Top /><main className="page"><Link className="btn ghost sm icon" href="/events" aria-label="กลับ"><Back /></Link><p className="empty">ไม่พบกิจกรรม หรือไม่มีสิทธิ์เข้าถึง</p></main></>;

  const curDate = ev.round_dates[cur - 1] ?? ev.event_date;
  const multi = ev.rounds > 1;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link className="btn ghost sm icon" href="/events" aria-label="กลับ" title="กลับ"><Back /></Link>
          <h1 className="top-title">{ev.name}</h1>
          {admin && (
            <button className="btn ghost sm icon" aria-label="ตั้งค่า" title="ตั้งค่า" aria-expanded={showSet} onClick={() => setShowSet((v) => !v)}><Gear /></button>
          )}
        </div>
      </header>
      <main className="page" style={{ paddingTop: 16 }}>
        {admin && showSet && (
          <section className="panel" aria-label="ตั้งค่ากิจกรรม">
            <div className="field">
              <span className="lbl" id="lv">ระดับการประชุม</span>
              <div className="chips" role="group" aria-labelledby="lv">
                {["รวมภาค", "ภาค", "เขต"].map((l) => (
                  <button key={l} className="chip" aria-pressed={ev.level === l} onClick={() => changeLevel(l)}><b>{l}</b></button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="cd">{multi ? `วันที่ครั้งที่ ${cur}` : "วันที่"}</label>
              <input id="cd" className="input" type="date" value={curDate} onChange={(e) => changeDate(e.target.value)} />
            </div>
            {ev.rounds < 20 && (
              <div className="addbox">
                <div className="field">
                  <label htmlFor="nd">เพิ่มครั้งที่ {ev.rounds + 1} วันที่</label>
                  <input id="nd" className="input" type="date" value={adding ?? todayLocal()} onChange={(e) => setAdding(e.target.value)} />
                </div>
                <button className="btn" onClick={addRound}>เพิ่ม</button>
              </div>
            )}
          </section>
        )}

        {multi ? (
          <div className="chips" role="group" aria-label="ครั้งที่">
            {Array.from({ length: ev.rounds }, (_, i) => i + 1).map((n) => (
              <button key={n} className="chip" aria-pressed={n === cur} onClick={() => pick(n)}>
                <b>ครั้งที่ {n}</b><small>{fmtShort(ev.round_dates[n - 1])} · {ev.counts[n - 1] ?? 0} คน</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="sub" style={{ margin: 0 }}>{fmtLong(curDate)}</p>
        )}
        <p className="sub" style={{ margin: 0 }}>ประชุมระดับ{ev.level} · ค้นหาได้ใน{ev.scope}</p>

        <div className="stat" aria-live="polite">
          <span className="n">{done.length}</span>
          <span className="sub" style={{ margin: 0 }}>{multi ? `คนเช็คชื่อแล้ว ในครั้งที่ ${cur}` : "คนเช็คชื่อแล้ว"}</span>
        </div>

        <div className="search">
          <div className="wrap">
            <Search />
            <input
              ref={input}
              className="input"
              autoFocus
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="ค้นหาด้วยรหัสสมาชิก หรือชื่อ"
              placeholder="รหัสสมาชิก หรือชื่อ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {err && <p className="msg bad" role="alert">{err}</p>}

        {q.trim() && resFor === q.trim() && (
          res.length === 0 ? (
            <p className="empty">ไม่พบสมาชิกใน{ev.scope}</p>
          ) : (
            <ul className="res">
              {res.map((m) => {
                const ok = doneSet.has(m.mt_co);
                return (
                  <li key={m.mt_co} className={`row${ok ? " done" : ""}`}>
                    <div className="who">
                      <strong>{m.name}</strong>
                      <span className="num">{m.mt_co} · เขต {m.khet}</span>
                    </div>
                    {ok ? (
                      <span className="tag"><Check /> เช็คแล้ว</span>
                    ) : (
                      <button className="btn" onClick={() => mark(m)}>เช็คชื่อ</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}

        {pending.length > 0 && !q.trim() && (
          <section>
            <h2 style={{ marginBottom: 4 }}>จากครั้งที่ {cur - 1} · ยังไม่เช็ค {pending.length} คน</h2>
            <ul className="res">
              {pending.map((m) => (
                <li key={m.mt_co} className="row">
                  <div className="who">
                    <strong>{m.name}</strong>
                    <span className="num">{m.mt_co}{m.khet ? ` · เขต ${m.khet}` : ""}</span>
                  </div>
                  <button className="btn" onClick={() => mark(m)}>เช็คชื่อ</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h2 style={{ marginBottom: 4 }}>{multi ? `รายชื่อครั้งที่ ${cur}` : "รายชื่อที่เช็คแล้ว"}</h2>
            <ul className="log">
              {done.map((d) => (
                <li key={d.mt_co}>
                  <span className="tag" style={{ paddingRight: 0 }}><Check /></span>
                  <div className="nm">{d.name}<small className="num">{d.mt_co}{d.khet ? ` · เขต ${d.khet}` : ""}</small></div>
                  <span className="time num">{new Date(d.checked_in_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                  <button className="btn ghost sm icon" aria-label={`ยกเลิกการเช็คชื่อ ${d.name ?? d.mt_co}`} onClick={() => undo(d.mt_co)}><Undo /></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>เช็คชื่อ <b>{toast.name}</b> แล้ว{multi ? ` (ครั้งที่ ${toast.round})` : ""}</span>
          <button className="btn sm" onClick={() => undo(toast.code, toast.round)}>ยกเลิก</button>
        </div>
      )}
    </>
  );
}
