import Holidays from "date-holidays";
import { ymd } from "@/lib/dates";

export interface JapanHoliday {
  date: string;
  name: string;
}

export function japanesePublicHolidays(year: number): JapanHoliday[] {
  const hd = new Holidays("JP");
  hd.setLanguages("ja");

  const list = hd.getHolidays(year)
    .filter((h) => h.type === "public")
    .map((h) => {
      const d = h.start;
      const date = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return {
        date,
        name: h.name,
      };
    });

  // keep unique dates in case upstream library returns duplicate observed rules
  const map = new Map<string, string>();
  for (const h of list) if (!map.has(h.date)) map.set(h.date, h.name);
  return [...map.entries()].map(([date, name]) => ({ date, name }));
}
