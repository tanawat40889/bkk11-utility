// "YYYY-MM-DD" for the device's local calendar day (NOT toISOString, which is UTC and is yesterday in Thailand before 07:00)
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const at = (s: string) => new Date(`${s}T00:00:00`);
export const fmtShort = (s: string) => at(s).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
export const fmtLong = (s: string) => at(s).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
export const fmtMonth = (s: string) => at(s).toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
export const dayNum = (s: string) => at(s).getDate();
