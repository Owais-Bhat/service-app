const FAST2SMS_OTP_SEND_URL = 'https://www.fast2sms.com/dev/otp/send';
const FAST2SMS_OTP_VERIFY_URL = 'https://www.fast2sms.com/dev/otp/verify';
const FAST2SMS_OTP_RESEND_URL = 'https://www.fast2sms.com/dev/otp/resend';
const FAST2SMS_BULK_URL = 'https://www.fast2sms.com/dev/bulkV2';

function normalizeIndianMobile(input) {
    const digits = String(input || '').replace(/\D/g, '');
    const normalized = digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : (digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits);
    return /^[6-9]\d{9}$/.test(normalized) ? normalized : null;
}

function getFast2SmsMessage(payload) {
    if (!payload) return 'Fast2SMS request failed';
    if (Array.isArray(payload.message)) return payload.message.join(', ');
    return payload.message || payload.error || payload.description || 'Fast2SMS request failed';
}

async function fast2SmsPost(url, body, { apiKey, fetchImpl = fetch } = {}) {
    if (!apiKey) return { ok: false, error: 'SMS_API is not configured on the server.' };

    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    let payload = null;
    try { payload = await response.json(); }
    catch { payload = null; }

    if (!response.ok || payload?.return === false) {
        return {
            ok: false,
            status: response.status,
            error: getFast2SmsMessage(payload),
            provider: payload,
        };
    }

    return { ok: true, status: response.status, provider: payload, otp: payload?.otp };
}

async function sendFast2SmsOtp({ mobile, apiKey, otpId, fetchImpl, otpLength = 6, otpExpiry = 10 }) {
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    if (!otpId) return { ok: false, error: 'Fast2SMS OTP template id is not configured.' };

    return fast2SmsPost(FAST2SMS_OTP_SEND_URL, {
        mobile: normalizedMobile,
        otp_id: otpId,
        otp_length: otpLength,
        otp_expiry: otpExpiry,
    }, { apiKey, fetchImpl });
}

async function sendFast2SmsQuickOtp({ mobile, otp, apiKey, fetchImpl, brand = 'Networking Experts' }) {
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    if (!/^\d{4,10}$/.test(String(otp || ''))) return { ok: false, error: 'Enter a valid OTP.' };

    return fast2SmsPost(FAST2SMS_BULK_URL, {
        route: 'q',
        numbers: normalizedMobile,
        message: `${otp} is your ${brand} verification code. It is valid for 10 minutes.`,
        flash: '0',
    }, { apiKey, fetchImpl });
}

async function verifyFast2SmsOtp({ mobile, otp, apiKey, fetchImpl }) {
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    if (!/^\d{4,10}$/.test(String(otp || ''))) return { ok: false, error: 'Enter a valid OTP.' };

    return fast2SmsPost(FAST2SMS_OTP_VERIFY_URL, {
        mobile: normalizedMobile,
        otp: String(otp),
    }, { apiKey, fetchImpl });
}

async function resendFast2SmsOtp({ mobile, apiKey, otpId, fetchImpl }) {
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    if (!otpId) return { ok: false, error: 'Fast2SMS OTP template id is not configured.' };

    return fast2SmsPost(FAST2SMS_OTP_RESEND_URL, {
        mobile: normalizedMobile,
        otp_id: otpId,
    }, { apiKey, fetchImpl });
}

module.exports = {
    normalizeIndianMobile,
    sendFast2SmsOtp,
    sendFast2SmsQuickOtp,
    verifyFast2SmsOtp,
    resendFast2SmsOtp,
};
