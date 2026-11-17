"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";
import { asset } from "@/lib/base";
import { Out } from "./icons";

export default function Top() {
  const r = useRouter();
  async function logout() {
    await sbBrowser().auth.signOut();
    r.replace("/login");
  }
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href="/events" aria-label="BKK11 เช็คชื่อ">
          <img src={asset("/logo.png")} alt="BKK11 รวมภาคกรุงเทพ" />
          <span>เช็คชื่อ</span>
        </Link>
        <span className="grow" />
        <button className="btn ghost sm icon" aria-label="ออกจากระบบ" title="ออกจากระบบ" onClick={logout}><Out /></button>
      </div>
    </header>
  );
}
