"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sbBrowser } from "@/lib/supabase-browser";

export default function Home() {
  const r = useRouter();
  useEffect(() => {
    sbBrowser().auth.getSession().then(({ data }) => r.replace(data.session ? "/events" : "/login"));
  }, [r]);
  return null;
}
