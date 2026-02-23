// Common disposable email domains — extend as needed
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "tempmail.com",
  "throwaway.email",
  "temp-mail.org",
  "fakeinbox.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "dispostable.com",
  "yopmail.com",
  "trashmail.com",
  "trashmail.me",
  "trashmail.net",
  "mailnesia.com",
  "maildrop.cc",
  "discard.email",
  "tempail.com",
  "emailondeck.com",
  "33mail.com",
  "getnada.com",
  "mohmal.com",
  "burnermail.io",
  "10minutemail.com",
  "minutemail.com",
  "tempr.email",
  "temp-mail.io",
  "mohmal.im",
  "mytemp.email",
  "getairmail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}
