import type { Locale } from "./i18n";

const LOCALE_COOKIE = "ts_lang";

export function getLocaleCookieName() {
  return LOCALE_COOKIE;
}
