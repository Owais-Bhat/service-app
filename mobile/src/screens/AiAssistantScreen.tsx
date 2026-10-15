import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import EmptyNote from '../components/admin/EmptyNote';
import FilterChips from '../components/admin/FilterChips';
import Icon from '../components/Icon';
import { askAssistant, AssistantVideo, ChatTurn } from '../api/ai';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  onBack: () => void;
}

interface Exchange {
  id: number;
  question: string;
  answer: string | null;
  videos: AssistantVideo[];
  error: string | null;
}

const SUGGESTIONS = ['CCTV shows no signal', 'View CCTV on mobile', 'Weak WiFi at site', 'Door lock not opening'];

// The line renderer for the model's light markdown: **bold** and bullets.
function Answer({ text, color, markColor }: { text: string; color: string; markColor: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <View>
      {lines.map((line, i) => {
        const bullet = /^[-*•]\s+/.test(line);
        const body = line.replace(/^[-*•]\s+/, '');
        const parts = body.split(/\*\*(.+?)\*\*/g);
        return (
          <Text key={i} style={[styles.answer, { color }, bullet && styles.bullet]}>
            {bullet ? <Text style={{ color: markColor, fontFamily: 'JetBrainsMono_700Bold' }}>•  </Text> : null}
            {parts.map((p, n) => (n % 2 === 1 ? <Text key={n} style={styles.strong}>{p}</Text> : p))}
          </Text>
        );
      })}
    </View>
  );
}

// AI Solution Assistant: describe the problem on site, get the steps and a
// solution video. The question box is pinned at the top, so the keyboard never
// covers it — and the newest answer always sits right under it.
export default function AiAssistantScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const [log, setLog] = useState<Exchange[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || sending) return;
    const id = Date.now();
    const history: ChatTurn[] = [...turns, { role: 'user', content: question }];
    setText('');
    setSending(true);
    setLog((l) => [{ id, question, answer: null, videos: [], error: null }, ...l]);
    try {
      const res = await askAssistant(history);
      setTurns([...history, { role: 'assistant', content: res.answer || '' }]);
      setLog((l) => l.map((x) => (x.id === id ? { ...x, answer: res.answer || 'No answer.', videos: res.videos || [] } : x)));
    } catch (e: unknown) {
      setTurns(turns);
      setLog((l) => l.map((x) => (x.id === id ? { ...x, error: e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.' } : x)));
    } finally {
      setSending(false);
    }
  };

  const openVideo = (v: AssistantVideo) => {
    const target = v.url || v.embed || v.search;
    if (target) Linking.openURL(target);
  };

  const toolbar = (
    <View style={styles.bar}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => ask(text)}
        returnKeyType="send"
        placeholder="Describe the issue"
        placeholderTextColor={theme.text3}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.panel }]}
      />
      <Pressable
        onPress={() => ask(text)}
        disabled={sending || !text.trim()}
        style={[styles.send, { backgroundColor: text.trim() ? brand.fill : theme.panel2 }]}
        accessibilityLabel="Send"
      >
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="arrow-right" size={20} color={text.trim() ? '#fff' : theme.text3} />}
      </Pressable>
    </View>
  );

  return (
    <AdminScreen title="AI Assistant" subtitle="Fix steps and solution videos" onBack={onBack} toolbar={toolbar}>
      {log.length === 0 ? (
        <View>
          <EmptyNote text="Describe the problem you are facing on site and I will walk you through the fix." icon="chat" />
          <FilterChips items={SUGGESTIONS.map((s) => ({ key: s, label: s }))} activeKey="" onSelect={(k) => ask(k)} />
        </View>
      ) : null}
      {log.map((x) => (
        <View key={x.id} style={styles.exchange}>
          <View style={[styles.bubble, styles.mine, { backgroundColor: brand.fill }]}>
            <Text style={[styles.question, { color: '#fff' }]}>{x.question}</Text>
          </View>
          <View style={[styles.bubble, styles.reply, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            {x.error ? (
              <Text style={[styles.answer, { color: theme.err }]}>{x.error}</Text>
            ) : x.answer === null ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <>
                <View style={styles.replyHead}>
                  <Icon name="sparkles" size={14} color={theme.vio} />
                  <Text style={[styles.overline, { color: theme.vio }]}>Suggested steps</Text>
                </View>
                <Answer text={x.answer} color={theme.text} markColor={theme.text3} />
              </>
            )}
          </View>
          {x.videos.map((v) => (
            <Pressable key={v.id} onPress={() => openVideo(v)} style={[styles.video, { borderColor: theme.border, backgroundColor: theme.panel }]}>
              <View style={[styles.videoThumb, { backgroundColor: theme.panel2 }]}>
                <Icon name="tutorial" size={22} color={theme.text2} />
              </View>
              <View style={styles.videoText}>
                <Text style={[styles.videoTitle, { color: theme.text }]}>{v.title}</Text>
                <Text style={[styles.videoSub, { color: theme.text3 }]}>{v.url || v.embed ? 'Watch the solution video' : 'Find solution videos on YouTube'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
      {log.length > 0 ? (
        <Text style={[styles.footnote, { color: theme.text3 }]}>The assistant only suggests. It never changes tickets or records.</Text>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(3), paddingBottom: spacing(2.5) },
  input: { flex: 1, ...typography.body, fontFamily: 'Manrope_500Medium', borderWidth: 1, borderRadius: 24, paddingHorizontal: spacing(4), height: 48 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  exchange: { marginBottom: 18, gap: spacing(2.5) },
  bubble: { padding: spacing(3.5) },
  mine: { alignSelf: 'flex-end', maxWidth: '84%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
  reply: { alignSelf: 'flex-start', maxWidth: '92%', borderWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, gap: spacing(2.5) },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overline: { ...typography.overline },
  question: { ...typography.body, fontFamily: 'Manrope_500Medium', lineHeight: 20, fontSize: 14 },
  answer: { ...typography.body, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  bullet: { marginTop: spacing(1.5) },
  strong: { fontFamily: 'Manrope_700Bold' },
  video: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), borderWidth: 1, borderRadius: radius.md, padding: spacing(2) },
  videoThumb: { width: 72, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  videoText: { flex: 1 },
  videoTitle: { ...typography.rowTitle, fontSize: 13, lineHeight: 17 },
  videoSub: { ...typography.supporting, fontSize: 11, lineHeight: 15 },
  footnote: { ...typography.supporting, fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
