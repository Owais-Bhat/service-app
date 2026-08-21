import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import StepIndicator from './StepIndicator';
import InstallTypeGrid, { InstallType } from './InstallTypeGrid';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { sendOtp, verifyOtp, resendOtp } from '../api/otp';
import { submitInquiry, Inquiry } from '../api/inquiries';
import { IssueOption } from '../api/landing';

interface Props {
  mode: 'request' | 'install';
  issueOptions: IssueOption[];
}

const PREFERRED_TIMES = ['Morning (10 AM - 1 PM)', 'Afternoon (1 PM - 4 PM)', 'Evening (4 PM - 6 PM)', 'Tomorrow Morning', "I'm Flexible"];
const CAPTCHA_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCaptcha(): string {
  return Array.from({ length: 5 }, () => CAPTCHA_LETTERS[Math.floor(Math.random() * CAPTCHA_LETTERS.length)]).join('');
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    const data = await res.json();
    return data.display_name || '';
  } catch {
    return '';
  }
}

export default function RequestWizard({ mode, issueOptions }: Props) {
  const { theme } = useTheme();

  const [installType, setInstallType] = useState<InstallType | null>(null);
  const [step, setStep] = useState(0); // 0 = verify, 1 = otp, 2 = details, 3 = success
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [capInput, setCapInput] = useState('');
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [locationMode, setLocationMode] = useState<'gps' | 'manual'>('manual');
  const [locationValue, setLocationValue] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [preferredTime, setPreferredTime] = useState(PREFERRED_TIMES[0]);
  const [billNo, setBillNo] = useState('');
  const [issueValue, setIssueValue] = useState(issueOptions[0]?.value ?? '');
  const [otherIssue, setOtherIssue] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Inquiry | null>(null);

  const needsInstallPick = mode === 'install' && !installType;

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setOtpError('Enter a valid 10-digit number'); return; }
    if (capInput.trim().toUpperCase() !== captcha) {
      setOtpError('Those letters don’t match — try again');
      setCaptcha(makeCaptcha());
      setCapInput('');
      return;
    }
    setOtpError(null);
    setSendingOtp(true);
    try {
      await sendOtp('+91' + phone);
      setStep(1);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setOtpError('Enter the full 6-digit code'); return; }
    setOtpError(null);
    setVerifyingOtp(true);
    try {
      await verifyOtp('+91' + phone, otp);
      setStep(2);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Incorrect code');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      await resendOtp('+91' + phone);
      setOtpError(null);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  };

  const handleDetectLocation = async () => {
    setDetecting(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setFormError('Location permission denied — switch to manual entry');
        setLocationMode('manual');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      const address = await reverseGeocode(lat, lng);
      setLocationValue(address || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } catch {
      setFormError('Could not detect location — switch to manual entry');
      setLocationMode('manual');
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async () => {
    const issueLabel = issueOptions.find((o) => o.value === issueValue)?.label || '';
    if (!name.trim()) { setFormError('Please enter your name'); return; }
    if (!locationValue.trim()) { setFormError('Please add your location'); return; }
    if (!installType) {
      if (!issueValue) { setFormError('Please pick an issue'); return; }
      if (issueValue === 'other' && !otherIssue.trim()) { setFormError('Please describe the issue'); return; }
    }
    setFormError(null);
    setSubmitting(true);
    const service_item = installType
      ? `Installation — ${installType.label}`
      : issueValue === 'other'
        ? `Other: ${otherIssue.trim()}`
        : issueLabel;
    try {
      const inquiry = await submitInquiry({
        full_name: name.trim(),
        phone: '+91' + phone,
        location: locationValue.trim(),
        service_item,
        description: description.trim() || null,
        bill_no: billNo.trim() || null,
        preferred_time: preferredTime,
        customer_lat: coords?.lat ?? null,
        customer_lng: coords?.lng ?? null,
      });
      setResult(inquiry);
      setStep(3);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (needsInstallPick) {
    return <InstallTypeGrid onSelect={setInstallType} />;
  }

  if (step === 3 && result) {
    return (
      <GlassCard>
        <Text style={[styles.title, { color: theme.text }]}>Request submitted</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>Your ticket number is</Text>
        <Text style={[styles.ticket, { color: brand.primary }]}>{result.ticket_no}</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(3) }]}>
          Save this number — you can track progress anytime from the Track tab.
        </Text>
      </GlassCard>
    );
  }

  return (
    <View>
      <StepIndicator steps={['Verify', 'OTP', 'Details']} activeIndex={step} />
      <GlassCard>
        {installType && (
          <View style={[styles.installBanner, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <Icon name="shield" size={16} color={brand.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.installBannerLabel, { color: theme.text3 }]}>Installation booking</Text>
              <Text style={[styles.installBannerName, { color: theme.text }]}>{installType.label}</Text>
            </View>
            <Pressable onPress={() => setInstallType(null)}>
              <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>Change</Text>
            </Pressable>
          </View>
        )}

        {step === 0 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>Enter your mobile number</Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              We&apos;ll send a one-time code to verify it&apos;s you.
            </Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="phone" size={16} color={theme.text3} />
              <Text style={[styles.cc, { color: theme.text3 }]}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                placeholder="98765 43210"
                placeholderTextColor={theme.text3}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
            <Text style={[styles.label, { color: theme.text3 }]}>Quick check — type these letters</Text>
            <View style={styles.captchaRow}>
              <View style={[styles.captchaBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                <Text style={[styles.captchaText, { color: theme.text }]}>{captcha}</Text>
              </View>
              <Pressable onPress={() => { setCaptcha(makeCaptcha()); setCapInput(''); }} style={[styles.captchaRefresh, { borderColor: theme.line }]}>
                <Icon name="refresh" size={16} color={theme.text2} />
              </Pressable>
            </View>
            <TextInput
              value={capInput}
              onChangeText={(v) => setCapInput(v.toUpperCase().slice(0, 5))}
              placeholder="Enter the letters"
              placeholderTextColor={theme.text3}
              autoCapitalize="characters"
              style={[styles.captchaInput, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
            />
            {otpError && <Text style={styles.error}>{otpError}</Text>}
            <GlowButton label={sendingOtp ? 'Sending…' : 'Send OTP by SMS'} onPress={handleSendOtp} loading={sendingOtp} />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>Enter the code</Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              We sent a 6-digit code to +91 {phone}.
            </Text>
            <TextInput
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="••••••"
              placeholderTextColor={theme.text3}
              style={[styles.otpInput, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
              maxLength={6}
            />
            {otpError && <Text style={styles.error}>{otpError}</Text>}
            <Pressable onPress={handleResendOtp} style={{ marginBottom: spacing(3) }}>
              <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>Resend code</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing(3) }}>
              <Pressable onPress={() => setStep(0)} style={[styles.backBtn, { borderColor: theme.line }]}>
                <Text style={{ color: theme.text }}>Back</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <GlowButton label={verifyingOtp ? 'Verifying…' : 'Verify code'} onPress={handleVerifyOtp} loading={verifyingOtp} />
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>
              {installType ? 'Book your installation' : "Tell us what's wrong"}
            </Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              {installType ? "A few details and we'll schedule your visit." : 'A few quick details so we can help fast.'}
            </Text>

            <Text style={[styles.label, { color: theme.text3 }]}>Your name</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="user" size={16} color={theme.text3} />
              <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
            </View>

            <Text style={[styles.label, { color: theme.text3 }]}>Location</Text>
            <View style={styles.segmentRow}>
              <Pressable onPress={() => setLocationMode('gps')} style={[styles.segment, { borderColor: theme.line }, locationMode === 'gps' && { backgroundColor: theme.surfaceStrong }]}>
                <Icon name="crosshair" size={14} color={locationMode === 'gps' ? brand.primary : theme.text3} />
                <Text style={{ color: locationMode === 'gps' ? brand.primary : theme.text3, fontSize: 12 }}>Current</Text>
              </Pressable>
              <Pressable onPress={() => setLocationMode('manual')} style={[styles.segment, { borderColor: theme.line }, locationMode === 'manual' && { backgroundColor: theme.surfaceStrong }]}>
                <Icon name="edit" size={14} color={locationMode === 'manual' ? brand.primary : theme.text3} />
                <Text style={{ color: locationMode === 'manual' ? brand.primary : theme.text3, fontSize: 12 }}>Manual</Text>
              </Pressable>
            </View>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="pin" size={16} color={theme.text3} />
              <TextInput
                value={locationValue}
                onChangeText={setLocationValue}
                editable={locationMode === 'manual'}
                placeholder={locationMode === 'gps' ? 'Tap detect to auto-fill…' : 'Type your address…'}
                placeholderTextColor={theme.text3}
                style={[styles.input, { color: theme.text }]}
              />
              {locationMode === 'gps' && (
                <Pressable onPress={handleDetectLocation} disabled={detecting}>
                  <Icon name="crosshair" size={16} color={brand.primary} />
                </Pressable>
              )}
            </View>
            {coords && (
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`)}>
                <Text style={{ color: brand.primary, fontSize: 11, marginBottom: spacing(2) }}>Open exact pin</Text>
              </Pressable>
            )}

            <Text style={[styles.label, { color: theme.text3 }]}>Preferred visit time</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="clock" size={16} color={theme.text3} />
              {Platform.OS === 'web' ? (
                <TextInput value={preferredTime} onChangeText={setPreferredTime} style={[styles.input, { color: theme.text }]} />
              ) : (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text }}>{preferredTime}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1.5) }}>
                    {PREFERRED_TIMES.map((t) => (
                      <Pressable key={t} onPress={() => setPreferredTime(t)}>
                        <Text style={{ fontSize: 10, color: t === preferredTime ? brand.primary : theme.text3 }}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <Text style={[styles.label, { color: theme.text3 }]}>Device bill number (optional)</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="receipt" size={16} color={theme.text3} />
              <TextInput value={billNo} onChangeText={setBillNo} placeholder="e.g. INV-2024-001" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
            </View>

            {!installType && (
              <>
                <Text style={[styles.label, { color: theme.text3 }]}>What&apos;s the issue?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) }}>
                  {issueOptions.map((o) => (
                    <Pressable
                      key={o.value}
                      onPress={() => setIssueValue(o.value)}
                      style={[styles.issueChip, { borderColor: theme.line, backgroundColor: issueValue === o.value ? theme.surfaceStrong : theme.panel2 }]}
                    >
                      <Text style={{ color: issueValue === o.value ? brand.primary : theme.text2, fontSize: 12 }}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {issueValue === 'other' && (
                  <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    <Icon name="edit" size={16} color={theme.text3} />
                    <TextInput value={otherIssue} onChangeText={setOtherIssue} placeholder="Describe your issue briefly" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
                  </View>
                )}
              </>
            )}

            <Text style={[styles.label, { color: theme.text3 }]}>Describe the problem (optional)</Text>
            <TextInput
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, 1000))}
              placeholder="Anything our technician should know…"
              placeholderTextColor={theme.text3}
              multiline
              numberOfLines={3}
              style={[styles.textarea, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
            />

            {formError && <Text style={styles.error}>{formError}</Text>}
            <GlowButton label={submitting ? 'Submitting…' : 'Submit request'} onPress={handleSubmit} loading={submitting} />
          </>
        )}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  label: { ...typography.caption, fontSize: 11, marginBottom: spacing(1.5), marginTop: spacing(3) },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(1), marginBottom: spacing(1) },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  cc: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  captchaRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1.5) },
  captchaBox: { flex: 1, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(3) },
  captchaText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18, letterSpacing: 4 },
  captchaRefresh: { width: 44, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  captchaInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), marginTop: spacing(2), textTransform: 'uppercase', letterSpacing: 3, fontFamily: 'JetBrainsMono_700Bold' },
  otpInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'JetBrainsMono_700Bold', marginBottom: spacing(2) },
  backBtn: { paddingHorizontal: spacing(4), paddingVertical: spacing(3.5), borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) },
  segment: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: radius.sm, borderWidth: 1 },
  issueChip: { paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: radius.full, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: radius.sm, padding: spacing(3), fontSize: 13, minHeight: 84, textAlignVertical: 'top', fontFamily: 'Manrope_400Regular' },
  installBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  installBannerLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  installBannerName: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginTop: 2 },
  ticket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, marginTop: spacing(1) },
});
