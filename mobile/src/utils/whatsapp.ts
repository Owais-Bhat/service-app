import { Linking, Share } from 'react-native';

// Opens WhatsApp's chat picker with the text pre-filled, so the admin chooses
// the group and presses send. Falls back to the wa.me web link, then to the
// phone's share sheet, so it always lands somewhere.
export async function sendToWhatsapp(text: string): Promise<'whatsapp' | 'share'> {
  const q = encodeURIComponent(text);
  // Very long messages do not survive a URL; the share sheet takes any length.
  if (q.length < 30000) {
    for (const url of [`whatsapp://send?text=${q}`, `https://wa.me/?text=${q}`]) {
      try {
        await Linking.openURL(url);
        return 'whatsapp';
      } catch {
        // Try the next one.
      }
    }
  }
  await Share.share({ message: text });
  return 'share';
}
