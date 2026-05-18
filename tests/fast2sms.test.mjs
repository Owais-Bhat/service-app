import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  normalizeIndianMobile,
  sendFast2SmsOtp,
  verifyFast2SmsOtp,
  resendFast2SmsOtp,
  sendDltSms,
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

test('sendDltSms sends Fast2SMS DLT message id and variables to bulk route', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ return: true, request_id: 'dlt_123' }),
    };
  };

  const result = await sendDltSms({
    mobile: '+91 98765 43210',
    templateId: '123456',
    variables: ['Customer', 'Rs.500', 'NE-123', 'BILL-123'],
    apiKey: 'secret-key',
    senderId: 'NTWRKE',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.accept, 'application/json');

  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.fast2sms.com/dev/bulkV2');
  assert.equal(url.searchParams.get('authorization'), 'secret-key');
  assert.equal(url.searchParams.get('route'), 'dlt');
  assert.equal(url.searchParams.get('numbers'), '9876543210');
  assert.equal(url.searchParams.get('sender_id'), 'NTWRKE');
  assert.equal(url.searchParams.get('message'), '123456');
  assert.equal(url.searchParams.get('variables_values'), 'Customer|Rs.500|NE-123|BILL-123');
  assert.equal(url.searchParams.get('flash'), '0');
});
