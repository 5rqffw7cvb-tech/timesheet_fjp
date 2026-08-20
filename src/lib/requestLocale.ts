import { cookies } from "next/headers";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./i18n";
import { getLocaleCookieName } from "./locale";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(getLocaleCookieName())?.value ?? DEFAULT_LOCALE);
}
