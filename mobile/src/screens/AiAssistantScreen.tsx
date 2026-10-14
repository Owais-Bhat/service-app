import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import EmptyNote from '../components/admin/EmptyNote';
import FilterChips from '../components/admin/FilterChips';
import Icon from '../components/Icon';
import { askAssistant, AssistantVideo, ChatTurn } from '../api/ai';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';

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
function Answer({ text, color }: { text: string; color: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <View>
      {lines.map((line, i) => {
        const bullet = /^[-*•]\s+/.test(line);
        const body = line.replace(/^[-*•]\s+/, '');
        const parts = body.split(/\*\*(.+?)\*\*/g);
        return (
          <Text key={i} style={[styles.answer, { color }, bullet && styles.bullet]}>
            {bullet ? '•  ' : ''}
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
        placeholder="Describe the problem, e.g. CCTV shows no signal…"
        placeholderTextColor={theme.text3}
        style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.panel2 }]}
      />
      <Pressable
        onPress={() => ask(text)}
        disabled={sending || !text.trim()}
        style={[styles.send, { backgroundColor: text.trim() ? brand.primary : theme.panel2, borderColor: theme.line }]}
        accessibilityLabel="Send"
      >
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="chevron-right" size={18} color={text.trim() ? '#fff' : theme.text3} />}
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
          <View style={[styles.bubble, styles.mine, { backgroundColor: `${brand.primary}22`, borderColor: brand.primary }]}>
            <Text style={[styles.answer, { color: theme.text }]}>{x.question}</Text>
          </View>
          <View style={[styles.bubble, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            {x.error ? (
              <Text style={[styles.answer, { color: semantic.danger }]}>{x.error}</Text>
            ) : x.answer === null ? (
              <ActivityIndicator size="small" color={brand.primary} />
            ) : (
              <Answer text={x.answer} color={theme.text} />
            )}
          </View>
          {x.videos.map((v) => (
            <Pressable key={v.id} onPress={() => openVideo(v)} style={[styles.video, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="tutorial" size={20} color={brand.primary} />
              <View style={styles.videoText}>
                <Text style={[styles.videoTitle, { color: theme.text }]}>{v.title}</Text>
                <Text style={[styles.videoSub, { color: theme.text3 }]}>{v.url || v.embed ? 'Watch the solution video' : 'Find solution videos on YouTube'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: spacing(2), paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  input: { flex: 1, ...typography.body, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), minHeight: 46 },
  send: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  exchange: { marginBottom: spacing(4) },
  bubble: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(2) },
  mine: { alignSelf: 'flex-end', maxWidth: '88%' },
  answer: { ...typography.body, lineHeight: 21 },
  bullet: { paddingLeft: spacing(1), marginTop: spacing(1) },
  strong: { fontWeight: '700' },
  video: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(2) },
  videoText: { flex: 1 },
  videoTitle: { ...typography.body, fontWeight: '700' },
  videoSub: { ...typography.caption },
});
