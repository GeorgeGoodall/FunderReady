# Password Reset Flow — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Overview

Add a "forgot password" flow for email/password users. Uses Supabase's built-in PKCE reset flow: user requests a reset email, clicks the link, the existing auth callback exchanges the code for a session, and the user sets a new password on a dedicated page.

Google OAuth users have no password and are unaffected.

## Flow

```
/login
  └─ "Forgot your password?" link → /forgot-password

/forgot-password
  └─ User enters email
  └─ supabase.auth.resetPasswordForEmail(email, {
       redirectTo: origin + "/auth/callback?redirect=/update-password"
     })
  └─ Always shows "Check your email" (no account enumeration)

Email link → /auth/callback?code=...&redirect=/update-password
  └─ exchangeCodeForSession(code) → sets session cookie
  └─ Redirects to /update-password
  └─ Expired/invalid code → existing fallback: /login?error=auth_failed

/update-password  (user has valid session)
  └─ New password + confirm password fields
  └─ Client validates: fields match + min 8 chars
  └─ supabase.auth.updateUser({ password })
  └─ Success → redirect to /dashboard
  └─ Error → display Supabase error message inline
```

## Pages

### `/forgot-password` (new)
- Public route (unauthenticated users must access it)
- Single email input with submit button
- On submit: call `resetPasswordForEmail`, show success state regardless of whether the email exists (prevents account enumeration)
- Success state: "Check your email" message (mirrors signup confirmation pattern)
- Link back to `/login`

### `/update-password` (new)
- Protected route — user arrives with a valid session (set by auth callback)
- Two fields: "New password" (min 8 chars) and "Confirm new password"
- Client-side validation: passwords match, min length
- On submit: call `supabase.auth.updateUser({ password })`
- On success: `router.push("/dashboard")`
- On error: display Supabase error message inline

## Changes to Existing Files

### `src/app/(auth)/login/page.tsx`
- Add a "Forgot your password?" link below the password field, linking to `/forgot-password`

### `src/proxy.ts`
- Add `/forgot-password` to the `publicRoutes` array
- `/update-password` does NOT need to be public — the user has a session by the time they arrive (set by the auth callback before redirect)

### `src/app/auth/callback/route.ts`
- No changes needed — already handles the `redirect` param correctly

## Out of Scope
- No new API routes
- No database changes
- No Inngest involvement
- Google OAuth users are not affected (they have no password)
- No "change password" feature for logged-in users (separate concern)
