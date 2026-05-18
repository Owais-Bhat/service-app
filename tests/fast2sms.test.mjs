import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  normalizeIndianMobile,
  sendFast2SmsOtp,
  verifyFast2SmsOtp,
  resendFast2SmsOtp,
  sendFast2SmsQuickOtp,
} = require('../server/fast2sms.cjs');

test('normalizeIndianMobile returns a 10 digit Indian mobile number', () => {
  assert.equal(normalizeIndianMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('9876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('12345'), null);
});

test('sendFast2SmsOtp posts mobile, otp id, and generated OTP with SMS_API authorization', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ return: true, request_id: 'req_123', otp: '654321' }),
    };
  };

  const result = await sendFast2SmsOtp({
    mobile: '+91 98765 43210',
    apiKey: 'secret-key',
    otpId: 'otp-template-1',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.otp, '654321');
  assert.equal(calls[0].url, 'https://www.fast2sms.com/dev/otp/send');
  assert.equal(calls[0].options.headers.authorization, 'secret-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    mobile: '9876543210',
    otp_id: 'otp-template-1',
    otp_length: 6,
    otp_expiry: 10,
  });
});

test('sendFast2SmsQuickOtp posts a complete OTP message without requiring an OTP template id', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ return: true, request_id: 'quick_123' }),
    };
  };

  const result = await sendFast2SmsQuickOtp({
    mobile: '+91 98765 43210',
    otp: '445566',
    apiKey: 'secret-key',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://www.fast2sms.com/dev/bulkV2');
  assert.equal(calls[0].options.headers.authorization, 'secret-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    route: 'q',
    numbers: '9876543210',
    message: '445566 is your Networking Experts verification code. It is valid for 10 minutes.',
    flash: '0',
  });
});

test('verifyFast2SmsOtp posts mobile and OTP to Fast2SMS verify endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ return: true, message: ['OTP verified successfully'] }),
    };
  };

  const result = await verifyFast2SmsOtp({
    mobile: '9876543210',
    otp: '123456',
    apiKey: 'secret-key',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://www.fast2sms.com/dev/otp/verify');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    mobile: '9876543210',
    otp: '123456',
  });
});

test('resendFast2SmsOtp posts mobile and OTP id to Fast2SMS resend endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ return: true, message: ['OTP resent successfully'] }),
    };
  };

  const result = await resendFast2SmsOtp({
    mobile: '9876543210',
    apiKey: 'secret-key',
    otpId: 'otp-template-1',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://www.fast2sms.com/dev/otp/resend');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    mobile: '9876543210',
    otp_id: 'otp-template-1',
  });
});
