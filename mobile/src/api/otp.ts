import { api } from './client';

// UX-only gate — mirrors web's sendSmsOTP/verifySmsOTP/resendSmsOTP
// (src/pages/landing.js). Verify returns no token; the caller just advances
// its local wizard step on success. Inquiry submission itself doesn't
// require a verified-OTP session server-side.
export function sendOtp(phone: string): Promise<unknown> {
  return api.post('/otp/send', { phone });
}

export function verifyOtp(phone: string, otp: string): Promise<unknown> {
  return api.post('/otp/verify', { phone, otp });
}

export function resendOtp(phone: string): Promise<unknown> {
  return api.post('/otp/resend', { phone });
}
