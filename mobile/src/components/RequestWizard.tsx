import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import GlowButton from './GlowButton';
import StepIndicator from './StepIndicator';
import InstallTypeGrid, { InstallType } from './InstallTypeGrid';
import { ActionButton, CardHeader, FieldError, GuestCard, GuestInput, InfoNote } from './GuestFields';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { sendOtp, verifyOtp, resendOtp } from '../api/otp';
import { submitInquiry, precheckBooking, Inquiry } from '../api/inquiries';
import { IssueOption } from '../api/landing';
import { uploadPublicPhoto } from '../api/upload';
import { PHONE_TEL, WHATSAPP_URL } from './ContactCard';

const MAX_PHOTOS = 3;
// `path` is the server-relative /uploads path once the upload has finished.
interface AttachedPhoto { uri: string; path: string | null; failed?: boolean }

export type WizardPhase = 'start' | 'flow' | 'success';

interface Props {
  mode: 'request' | 'install';
  issueOptions: IssueOption[];
  /** Reports where the customer is so the landing screen can drop the hero. */
  onPhase?: (phase: WizardPhase) => void;
  /** "Track this request" on the success screen. */
  onTrack?: (ticketNo: string, phone: string) => void;
  /** "Back to home" on the success screen. */
  onDone?: () => void;
}

const CAPTCHA_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const OTP_LENGTH = 6;

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

export default function RequestWizard({ mode, issueOptions, onPhase, onTrack, onDone }: Props) {
  const { theme } = useTheme();

  const [installType, setInstallType] = useState<InstallType | null>(null);
  const [step, setStep] = useState(0); // 0 = verify, 1 = otp, 2 = details, 3 = success
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [capInput, setCapInput] = useState('');
  const [otp, setOtp] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [locationValue, setLocationValue] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [billNo, setBillNo] = useState('');
  const [issueValue, setIssueValue] = useState(issueOptions[0]?.value ?? '');
  const [otherIssue, setOtherIssue] = useState('');
  const [description, setDescription] = useState('');
  const [siteContact, setSiteContact] = useState('');
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [blocked, setBlocked] = useState<{ message: string; dues: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Inquiry | null>(null);
  const [copied, setCopied] = useState(false);

  const needsInstallPick = mode === 'install' && !installType;
  const phase: WizardPhase = step === 3 && result ? 'success' : step >= 1 || installType ? 'flow' : 'start';

  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);

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
    if (otp.length !== OTP_LENGTH) { setOtpError('Enter the full 6-digit code'); return; }
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
        setFormError('Location permission denied — type your address instead');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      const address = await reverseGeocode(lat, lng);
      setLocationValue(address || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } catch {
      setFormError('Could not detect location — type your address instead');
    } finally {
      setDetecting(false);
    }
  };

  // Photos upload as soon as they are picked, so submit only has to send paths.
  const addPhotoAssets = async (uris: string[]) => {
    const room = MAX_PHOTOS - photos.length;
    const picked = uris.slice(0, Math.max(room, 0));
    if (!picked.length) return;
    setPhotos((prev) => [...prev, ...picked.map((uri) => ({ uri, path: null }))]);
    await Promise.all(
      picked.map(async (uri) => {
        try {
          const path = await uploadPublicPhoto(uri);
          setPhotos((prev) => prev.map((p) => (p.uri === uri ? { ...p, path } : p)));
        } catch {
          setPhotos((prev) => prev.map((p) => (p.uri === uri ? { ...p, failed: true } : p)));
        }
      }),
    );
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setFormError('Camera permission is needed to take a photo'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!res.canceled && res.assets?.length) await addPhotoAssets(res.assets.map((a) => a.uri));
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setFormError('Photo library permission is needed to attach a photo'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!res.canceled && res.assets?.length) await addPhotoAssets(res.assets.map((a) => a.uri));
  };

  const handleAddPhoto = () => {
    setFormError(null);
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => { void takePhoto(); } },
      { text: 'Choose from library', onPress: () => { void pickPhotos(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadingPhotos = photos.some((p) => !p.path && !p.failed);

  const handleSubmit = async () => {
    const issueLabel = issueOptions.find((o) => o.value === issueValue)?.label || '';
    if (uploadingPhotos) { setFormError('Photos are still uploading — one moment'); return; }
    if (!name.trim()) { setFormError('Please enter your name'); return; }
    if (!locationValue.trim()) { setFormError('Please add your location'); return; }
    if (!installType) {
      if (!issueValue) { setFormError('Please pick an issue'); return; }
      if (issueValue === 'other' && !otherIssue.trim()) { setFormError('Please describe the issue'); return; }
    }
    setFormError(null);
    setBlocked(null);
    setSubmitting(true);
    const service_item = installType
      ? `Installation — ${installType.label}`
      : issueValue === 'other'
        ? `Other: ${otherIssue.trim()}`
        : issueLabel;
    try {
      const check = await precheckBooking({ phone: '+91' + phone, lat: coords?.lat ?? null, lng: coords?.lng ?? null, location: locationValue.trim() });
      if (!check.ok) {
        const dues = (check.pending || []).map((p) => `${p.what}${p.ref ? ` (${p.ref})` : ''} — ₹${Math.round(p.amount_paise / 100)}`);
        setBlocked({ message: check.message || 'We cannot take this booking right now.', dues });
        return;
      }
      // Installations have no "describe the problem" — the site details and the
      // on-site contact travel in the description the technician reads.
      const fullDescription = installType
        ? [description.trim(), siteContact.trim() ? `Contact at site: ${siteContact.trim()}` : ''].filter(Boolean).join('\n')
        : description.trim();
      const inquiry = await submitInquiry({
        full_name: name.trim(),
        phone: '+91' + phone,
        location: locationValue.trim(),
        service_item,
        description: fullDescription || null,
        photo_urls: photos.map((p) => p.path).filter((p): p is string => !!p),
        bill_no: billNo.trim() || null,
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

  const copyTicket = async () => {
    if (!result) return;
    try {
      await Clipboard.setStringAsync(result.ticket_no);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is a convenience — the number is on screen either way.
    }
  };

  const shareTicket = () => {
    if (!result) return;
    void Share.share({ message: `My Networking Experts ticket number is ${result.ticket_no}` }).catch(() => {});
  };

  if (needsInstallPick) {
    return <InstallTypeGrid onSelect={setInstallType} />;
  }

  if (step === 3 && result) {
    return (
      <View>
        <View style={[styles.successIcon, { backgroundColor: theme.okS }]}>
          <Ionicons name="checkmark-circle-outline" size={40} color={theme.ok} />
        </View>
        <Text style={[typography.largeTitle, { color: theme.text }]}>
          {installType ? 'Installation booked' : 'Request received'}
        </Text>
        <Text style={[typography.body, styles.successBody, { color: theme.text2 }]}>
          {installType
            ? 'Our team will call within working hours to confirm the site visit.'
            : "We'll assign a technician shortly and send you an SMS when they're on the way."}
        </Text>
        <View style={{ marginTop: spacing(6) }}>
          <GuestCard>
            <Text style={[typography.overline, { color: theme.text3 }]}>Your ticket number</Text>
            <Text style={[styles.ticket, { color: theme.accent }]} selectable>{result.ticket_no}</Text>
            <View style={styles.rowGap10}>
              <ActionButton label={copied ? 'Copied' : 'Copy'} icon={copied ? 'checkmark-outline' : 'copy-outline'} onPress={() => { void copyTicket(); }} />
              <ActionButton label="Share" icon="share-social-outline" onPress={shareTicket} />
            </View>
            <View style={{ marginTop: spacing(3.5) }}>
              <InfoNote icon="bookmark-outline" text="Save this number. You'll need it with your phone number to track or reopen." />
            </View>
          </GuestCard>
        </View>
        {onTrack ? (
          <View style={{ marginTop: spacing(6) }}>
            <GlowButton label={installType ? 'Track this booking' : 'Track this request'} onPress={() => onTrack(result.ticket_no, phone)} />
          </View>
        ) : null}
        {onDone ? (
          <Pressable onPress={onDone} accessibilityRole="button" style={styles.homeBtn}>
            <Text style={[styles.homeBtnText, { color: theme.text2 }]}>Back to home</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const otpActive = Math.min(otp.length, OTP_LENGTH - 1);

  return (
    <GuestCard>
      {installType && (
        <View style={[styles.installBanner, { backgroundColor: theme.tealS }]}>
          <Ionicons name={installType.icon} size={22} color={theme.teal} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.installBannerName, { color: theme.text }]}>{installType.label}</Text>
            <Text style={[styles.installBannerLabel, { color: theme.text2 }]}>Installation booking</Text>
          </View>
          <Pressable
            onPress={() => setInstallType(null)}
            accessibilityRole="button"
            style={[styles.changeBtn, { borderColor: theme.line }]}
          >
            <Text style={[styles.changeText, { color: theme.text }]}>Change</Text>
          </Pressable>
        </View>
      )}

      <StepIndicator steps={['Verify', 'OTP', 'Details']} activeIndex={step} />

      {step === 0 && (
        <>
          <CardHeader title="Verify your number" body="We'll send a 6-digit code to this number." />
          <View style={styles.fields}>
            <GuestInput
              label="Mobile number"
              required
              prefix="+91"
              mono
              keyboardType="number-pad"
              placeholder="98765 43210"
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
            />
            <View>
              <Text style={[styles.label, { color: theme.text2 }]}>
                Type the letters you see<Text style={{ color: theme.err }}> *</Text>
              </Text>
              <View style={styles.captchaRow}>
                <View style={[styles.captchaBox, { borderColor: theme.border, backgroundColor: theme.panel2 }]}>
                  <Text style={[styles.captchaText, { color: theme.text, textDecorationColor: theme.text3 }]}>{captcha}</Text>
                </View>
                <Pressable
                  onPress={() => { setCaptcha(makeCaptcha()); setCapInput(''); }}
                  accessibilityRole="button"
                  accessibilityLabel="New letters"
                  style={[styles.captchaRefresh, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  <Ionicons name="refresh-outline" size={20} color={theme.text2} />
                </Pressable>
              </View>
              <GuestInput
                placeholder="5 letters"
                autoCapitalize="characters"
                value={capInput}
                onChangeText={(v) => setCapInput(v.toUpperCase().slice(0, 5))}
              />
            </View>
          </View>
          {otpError && <FieldError text={otpError} />}
          <View style={{ marginTop: spacing(3) }}>
            <GlowButton label={sendingOtp ? 'Sending…' : 'Send OTP'} onPress={handleSendOtp} loading={sendingOtp} icon="arrow-right" />
          </View>
        </>
      )}

      {step === 1 && (
        <>
          <CardHeader
            title="Enter the 6-digit code"
            body={
              <>
                Sent to <Text style={{ fontFamily: 'JetBrainsMono_500Medium', color: theme.text }}>+91 {phone}</Text>
                {' · '}
                <Text onPress={() => { setOtp(''); setOtpError(null); setStep(0); }} style={{ color: theme.accent, fontFamily: 'Manrope_700Bold' }}>
                  Change number
                </Text>
              </>
            }
          />
          <View style={styles.otpWrap}>
            <View style={styles.otpRow} pointerEvents="none">
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    {
                      backgroundColor: theme.panel2,
                      borderColor: otpFocused && i === otpActive ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.otpDigit, { color: theme.text }]}>{otp[i] ?? ''}</Text>
                </View>
              ))}
            </View>
            {/* The real input sits invisibly over the boxes so SMS autofill and the
                number pad work exactly like a single code field. */}
            <TextInput
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              onFocus={() => setOtpFocused(true)}
              onBlur={() => setOtpFocused(false)}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              caretHidden
              accessibilityLabel="6-digit code"
              style={styles.otpInput}
            />
          </View>
          <View style={styles.resendRow}>
            <Ionicons name="time-outline" size={16} color={theme.text2} />
            <Text style={[typography.supporting, { color: theme.text2 }]}>Didn’t get a code?</Text>
            <Pressable onPress={handleResendOtp} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: theme.accent, fontFamily: 'Manrope_700Bold', fontSize: 13 }}>Resend code</Text>
            </Pressable>
          </View>
          <InfoNote tone="info" icon="information-circle-outline" text="Your phone can fill this in from the SMS automatically." />
          {otpError && <FieldError text={otpError} />}
          <View style={{ marginTop: spacing(3) }}>
            <GlowButton label={verifyingOtp ? 'Verifying…' : 'Verify code'} onPress={handleVerifyOtp} loading={verifyingOtp} />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.verified}>
            <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
            <Text style={[styles.verifiedText, { color: theme.accent }]}>+91 {phone} verified</Text>
          </View>

          <View style={styles.fields}>
            <GuestInput label="Your name" required placeholder="Full name" value={name} onChangeText={setName} />

            <View>
              <GuestInput
                label="Location"
                required
                multiline
                minHeight={52}
                placeholder="Shop / building, area, city"
                value={locationValue}
                onChangeText={setLocationValue}
              />
              <Pressable
                onPress={handleDetectLocation}
                disabled={detecting}
                accessibilityRole="button"
                style={({ pressed }) => [styles.locateBtn, { borderColor: theme.line }, pressed && { opacity: 0.7 }]}
              >
                {detecting ? <ActivityIndicator size="small" color={theme.accent} /> : <Ionicons name="locate-outline" size={16} color={theme.accent} />}
                <Text style={[styles.locateText, { color: theme.accent }]}>{detecting ? 'Detecting…' : 'Use current location'}</Text>
              </Pressable>
              {coords && (
                <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`)} hitSlop={8}>
                  <Text style={{ color: theme.accent, fontFamily: 'Manrope_600SemiBold', fontSize: 12, marginTop: spacing(2) }}>Open exact pin</Text>
                </Pressable>
              )}
            </View>

            <GuestInput
              label="Device bill number"
              optional
              placeholder="e.g. INV-2024-001"
              value={billNo}
              onChangeText={setBillNo}
            />

            {!installType && (
              <View>
                <Text style={[styles.label, { color: theme.text2 }]}>
                  What needs attention?<Text style={{ color: theme.err }}> *</Text>
                </Text>
                <View style={styles.chipRow}>
                  {issueOptions.map((o) => {
                    const on = issueValue === o.value;
                    return (
                      <Pressable
                        key={o.value}
                        onPress={() => setIssueValue(o.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.chip,
                          on
                            ? { backgroundColor: theme.okS, borderColor: theme.accent, borderWidth: 1.5 }
                            : { borderColor: theme.border, borderWidth: 1 },
                        ]}
                      >
                        {on ? <Ionicons name="checkmark" size={14} color={theme.accent} /> : null}
                        <Text style={[styles.chipText, { color: on ? theme.accent : theme.text2, fontFamily: on ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}>
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {!installType && issueValue === 'other' && (
              <GuestInput placeholder="Describe your issue briefly" value={otherIssue} onChangeText={setOtherIssue} />
            )}

            <GuestInput
              label={installType ? 'Site details' : 'Describe the issue'}
              optional
              multiline
              minHeight={installType ? 72 : 84}
              placeholder={installType ? 'e.g. Ground floor shop + godown, approx. 6 cameras, need mobile viewing' : 'Anything our technician should know…'}
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, 1000))}
            />

            {installType && (
              <GuestInput
                label="Contact at site"
                optional
                placeholder="Same as above — or name and number"
                value={siteContact}
                onChangeText={(v) => setSiteContact(v.slice(0, 120))}
              />
            )}

            <View>
              <Text style={[styles.label, { color: theme.text2 }]}>
                Photos <Text style={{ color: theme.text3, fontFamily: 'Manrope_500Medium' }}>(optional, up to {MAX_PHOTOS})</Text>
              </Text>
              <View style={styles.photoRow}>
                {photos.map((p) => (
                  <View key={p.uri} style={[styles.photoBox, { borderColor: p.failed ? theme.err : theme.border }]}>
                    <Image source={{ uri: p.uri }} style={styles.photoImg} />
                    {!p.path && !p.failed && (
                      <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>
                    )}
                    {p.failed && (
                      <View style={styles.photoOverlay}><Text style={styles.photoFail}>Failed</Text></View>
                    )}
                    <Pressable
                      onPress={() => setPhotos((prev) => prev.filter((x) => x.uri !== p.uri))}
                      style={styles.photoRemove}
                      accessibilityLabel="Remove photo"
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable
                    onPress={handleAddPhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Add photo"
                    style={[styles.photoBox, styles.photoAdd, { borderColor: theme.border }]}
                  >
                    <Ionicons name="camera-outline" size={22} color={theme.text2} />
                    <Text style={[styles.photoAddText, { color: theme.text2 }]}>Add</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {blocked && (
            <View style={[styles.blocked, { borderColor: theme.warn, backgroundColor: theme.warnS }]}>
              <View style={styles.blockedHead}>
                <Ionicons name="alert-circle-outline" size={22} color={theme.warn} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockedTitle, { color: theme.text }]}>We can&apos;t book this online yet</Text>
                  <Text style={[typography.supporting, { color: theme.text2, marginTop: 2 }]}>{blocked.message}</Text>
                  {blocked.dues.map((d) => (
                    <Text key={d} style={[typography.supporting, { color: theme.text, marginTop: spacing(1) }]}>{d}</Text>
                  ))}
                  <Text style={[typography.supporting, { color: theme.text2, marginTop: spacing(1.5) }]}>
                    Your details are saved. Call or WhatsApp us if you think this is a mistake.
                  </Text>
                </View>
              </View>
              <View style={styles.rowGap8}>
                <ActionButton label="Call support" icon="call-outline" onPress={() => Linking.openURL(PHONE_TEL)} />
                <ActionButton label="WhatsApp" icon="logo-whatsapp" onPress={() => Linking.openURL(WHATSAPP_URL)} />
              </View>
            </View>
          )}

          {formError && <FieldError text={formError} />}
          <View style={{ marginTop: spacing(3) }}>
            <GlowButton
              label={submitting ? 'Submitting…' : installType ? 'Book installation' : 'Submit request'}
              onPress={handleSubmit}
              loading={submitting}
            />
          </View>
        </>
      )}
    </GuestCard>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, marginTop: spacing(4) },
  label: { ...typography.caption, marginBottom: spacing(1.5) },
  captchaRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) },
  captchaBox: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  captchaText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, letterSpacing: 8, fontStyle: 'italic', textDecorationLine: 'line-through' },
  captchaRefresh: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  otpWrap: { marginTop: spacing(4), marginBottom: spacing(2.5) },
  otpRow: { flexDirection: 'row', gap: spacing(2) },
  otpBox: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  otpDigit: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22 },
  otpInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  resendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(4.5) },
  verified: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(3) },
  verifiedText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  locateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    height: 40,
    marginTop: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  locateText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), height: 36, paddingHorizontal: spacing(3), borderRadius: radius.full },
  chipText: { fontSize: 13 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  photoBox: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  photoAdd: { alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1.5, borderStyle: 'dashed' },
  photoAddText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  photoImg: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoFail: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  photoRemove: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  blocked: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: spacing(4) },
  blockedHead: { flexDirection: 'row', gap: spacing(2.5) },
  blockedTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  rowGap8: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  rowGap10: { flexDirection: 'row', gap: 10 },
  installBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: spacing(4) },
  installBannerName: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  installBannerLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12 },
  changeBtn: { height: 32, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  changeText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  successIcon: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(5) },
  successBody: { marginTop: spacing(2) },
  ticket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 28, letterSpacing: 0.5, marginTop: spacing(1.5), marginBottom: spacing(3.5) },
  homeBtn: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing(2.5) },
  homeBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
