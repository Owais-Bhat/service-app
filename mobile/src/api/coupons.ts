import { api, ApiError } from './client';

export interface CouponResult {
  valid: boolean;
  code?: string;
  discount?: number;
  label?: string;
  error?: string;
}

// A non-2xx here (unknown code, expired, usage limit hit) is a normal
// "this code doesn't work" outcome, not an exceptional one — swallowed into
// { valid: false, error } so callers don't need a try/catch for every check.
export async function validateCoupon(code: string, amount: number): Promise<CouponResult> {
  try {
    return await api.post<CouponResult>('/coupons/validate', { code, amount });
  } catch (err) {
    return { valid: false, error: err instanceof ApiError ? err.message : 'Could not validate coupon' };
  }
}

export async function redeemCoupon(code: string, amount: number, inquiryId: string): Promise<CouponResult> {
  try {
    return await api.post<CouponResult>('/coupons/redeem', { code, amount, inquiry_id: inquiryId });
  } catch (err) {
    return { valid: false, error: err instanceof ApiError ? err.message : 'Could not redeem coupon' };
  }
}
