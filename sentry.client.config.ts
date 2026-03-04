import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    // Filter out Next.js redirect "errors" which are not real errors
    if (event.exception?.values?.some((e) => e.type === "NEXT_REDIRECT")) {
      return null;
    }
    return event;
  },
});
