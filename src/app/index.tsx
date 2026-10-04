import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Button, C, Icon, IconName, Logo, Page, s } from '@/components/clean-ui';
import { Role, useStore } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
import AccountWelcome from '@/components/account-welcome';

const DEMO_PASSWORD = 'CleanTrackDemo!';
const portals: Record<
  Role,
  { icon: IconName; headline: string; description: string; hint: string }
> = {
  Resident: {
    icon: 'home-outline',
    headline: 'A cleaner community\nstarts with you.',
    description: 'Report a problem. Follow its progress. Make a difference, right where you live.',
    hint: 'Report waste and follow your reports.',
  },
  Collector: {
    icon: 'car-outline',
    headline: 'Every collection.\nA better tomorrow.',
    description:
      'Your next task, your route, and your impact. Everything you need for a cleaner barangay.',
    hint: 'View your assignments and update collections.',
  },
  Admin: {
    icon: 'shield-checkmark-outline',
    headline: 'Bring your community\ntogether.',
    description:
      'Turn reports into action. Coordinate your team and keep your barangay moving forward.',
    hint: 'Review reports and coordinate your team.',
  },
};

export default function Welcome() {
  return firebaseConfigured ? <AccountWelcome /> : <DemoWelcome />;
}
function DemoWelcome() {
  const compact = useWindowDimensions().width < 600;
  const { users, login } = useStore();
  const [role, setRole] = useState<Role>('Resident');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState<string>();
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const portal = portals[role];
  const account = users.find((person) => person.role === role);
  function changeRole(next: Role) {
    setRole(next);
    setError('');
    setEmail('');
    setPassword('');
    setVisible(false);
  }
  function signIn() {
    if (!email.trim() || !password) {
      setError('Enter your email address and password to continue.');
      return;
    }
    const person = users.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase() && p.role === role,
    );
    if (!person || password !== DEMO_PASSWORD) {
      setError(
        'These demo credentials do not match this role. Open the demo account below to try CleanTrack.',
      );
      return;
    }
    setPassword('');
    login(person.id);
    router.replace('/home');
  }
  return (
    <Page contentStyle={compact ? { gap: 16 } : undefined}>
      <View style={styles.top}>
        <Logo />
        {!compact && (
          <View style={styles.pill}>
            <View style={styles.dot} />
            <Text style={styles.pillText}>COMMUNITY FIRST</Text>
          </View>
        )}
      </View>
      <View style={[styles.hero, compact && { padding: 20, gap: 10 }]}>
        <View style={styles.halo} />
        <View style={styles.haloSmall} />
        {!compact && (
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Icon name="leaf-outline" size={27} color="#d5f7dd" />
            </View>
            <Text style={styles.heroEyebrow}>SMALL ACTIONS. REAL CHANGE.</Text>
          </View>
        )}
        <Text style={[styles.heroTitle, compact && { fontSize: 26, lineHeight: 31 }]}>
          {portal.headline}
        </Text>
        {!compact && <Text style={styles.heroDescription}>{portal.description}</Text>}
        <View style={[styles.heroFooter, compact && { paddingTop: 10 }]}>
          <View style={styles.leafPair}>
            <Icon name="leaf" size={15} color="#c7e5a4" />
            <Icon name="leaf" size={12} color="#a5d0b2" />
          </View>
          <Text style={styles.heroFootText}>Together for a cleaner tomorrow</Text>
        </View>
      </View>
      <View style={{ gap: 7 }}>
        <Text style={styles.title}>
          Welcome back<Text style={{ color: C.green }}>.</Text>
        </Text>
        <Text style={s.muted}>Choose your role and let’s make a difference.</Text>
      </View>
      <View accessibilityRole="tablist" style={styles.roles}>
        {(['Resident', 'Collector', 'Admin'] as Role[]).map((r) => (
          <Pressable
            key={r}
            accessibilityRole="tab"
            accessibilityLabel={r}
            accessibilityState={{ selected: role === r }}
            aria-selected={role === r}
            onPress={() => changeRole(r)}
            style={[styles.role, role === r && styles.selectedRole]}
          >
            <Icon name={portals[r].icon} size={23} color={role === r ? C.green : '#86948e'} />
            <Text style={[styles.roleText, role === r && { color: C.green }]}>{r}</Text>
            {role === r && <View style={styles.selectionMark} />}
          </Pressable>
        ))}
      </View>
      <View style={[styles.form, compact && { gap: 16, padding: 18 }]}>
        <View style={s.between}>
          <Text style={styles.formTitle}>{role} login</Text>
          <View style={styles.demoLabel}>
            <Text style={styles.demoLabelText}>DEMO MODE</Text>
          </View>
        </View>
        <Text style={[s.muted, { marginTop: -10, fontSize: 12 }]}>{portal.hint}</Text>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Email address</Text>
          <View style={[styles.inputRow, focused === 'email' && styles.inputFocus]}>
            <Icon name="mail-outline" size={19} color={focused === 'email' ? C.green : C.muted} />
            <TextInput
              accessibilityLabel="Email address"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError('');
              }}
              placeholder="you@example.com"
              placeholderTextColor="#93a19a"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(undefined)}
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
            />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Password</Text>
          <View style={[styles.inputRow, focused === 'password' && styles.inputFocus]}>
            <Icon
              name="lock-closed-outline"
              size={19}
              color={focused === 'password' ? C.green : C.muted}
            />
            <TextInput
              ref={passwordInput}
              accessibilityLabel="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              placeholder="Enter demo password"
              placeholderTextColor="#93a19a"
              style={styles.input}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(undefined)}
              returnKeyType="go"
              onSubmitEditing={signIn}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={visible ? 'Hide password' : 'Show password'}
              onPress={() => setVisible(!visible)}
              style={styles.eye}
            >
              <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} color={C.muted} size={20} />
            </Pressable>
          </View>
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <Button title={`Log in as ${role}`} onPress={signIn} />
        <View style={styles.demoNotice}>
          <Icon name="information-circle-outline" size={17} color={C.muted} />
          <Text style={styles.noticeText}>
            Demo accounts only. Online sign-in isn’t connected yet.
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: demo }}
        aria-expanded={demo}
        onPress={() => setDemo(!demo)}
        style={styles.tryDemo}
      >
        <View style={s.row}>
          <View style={styles.demoIcon}>
            <Icon name="play-outline" size={18} />
          </View>
          <View>
            <Text style={s.label}>Just looking around?</Text>
            <Text style={s.muted}>Try a {role.toLowerCase()} demo account</Text>
          </View>
        </View>
        <Icon name={demo ? 'chevron-up' : 'chevron-down'} size={17} />
      </Pressable>
      {demo && (
        <View style={[s.card, { backgroundColor: '#edf5ef', borderColor: '#d5e5d9' }]}>
          <Text style={s.label}>Your {role.toLowerCase()} demo</Text>
          <Text selectable style={s.muted}>
            {account?.email}
            {'\n'}Password: {DEMO_PASSWORD}
          </Text>
          <Button
            title="Fill demo credentials"
            secondary
            onPress={() => {
              setEmail(account?.email ?? '');
              setPassword(DEMO_PASSWORD);
              setError('');
            }}
          />
          <Button
            title={`Continue as ${role}`}
            onPress={() => {
              if (account) {
                login(account.id);
                router.replace('/home');
              }
            }}
          />
        </View>
      )}
      <View style={styles.footer}>
        <Icon name="leaf-outline" size={15} />
        <Text style={styles.footerText}>A cleaner today. A brighter tomorrow.</Text>
      </View>
    </Page>
  );
}
const styles = StyleSheet.create({
  top: { gap: 18, paddingTop: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.green },
  pillText: { fontSize: 9, color: C.green, fontWeight: '700', letterSpacing: 1.4 },
  hero: { backgroundColor: '#07583f', borderRadius: 26, padding: 25, gap: 18, overflow: 'hidden' },
  halo: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 35,
    borderColor: '#ffffff08',
    right: -100,
    top: -70,
  },
  haloSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: '#ffffff12',
    right: -50,
    bottom: -90,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#ffffff12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroEyebrow: { color: '#add4bd', fontSize: 8, fontWeight: '600', letterSpacing: 1.2 },
  heroTitle: {
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 35,
    color: '#fff',
    letterSpacing: -0.8,
  },
  heroDescription: { color: '#c0dace', fontSize: 13, lineHeight: 21, maxWidth: 350 },
  heroFooter: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ffffff15',
    paddingTop: 15,
  },
  leafPair: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  heroFootText: { fontSize: 10, color: '#c9e3c9' },
  title: { fontSize: 29, fontWeight: '800', color: C.dark, letterSpacing: -0.8 },
  roles: { flexDirection: 'row', gap: 9 },
  role: {
    flex: 1,
    paddingVertical: 17,
    gap: 8,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
  },
  selectedRole: { backgroundColor: '#eaf5ee', borderColor: '#65ab89' },
  roleText: { fontSize: 12, fontWeight: '600', color: C.muted },
  selectionMark: {
    position: 'absolute',
    bottom: 0,
    width: 22,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: C.green,
  },
  form: {
    gap: 20,
    backgroundColor: '#fff',
    padding: 21,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
  },
  formTitle: { fontSize: 18, color: C.dark, fontWeight: '700' },
  demoLabel: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#f1f4f1',
    borderRadius: 5,
  },
  demoLabelText: { fontSize: 8, color: '#7d8c80', fontWeight: '700', letterSpacing: 0.8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e9e4',
    borderRadius: 12,
    paddingLeft: 14,
    backgroundColor: '#fbfcfb',
    minHeight: 53,
  },
  inputFocus: { borderColor: C.green, backgroundColor: '#fff' },
  input: { flex: 1, minWidth: 0, padding: 13, fontSize: 14, color: C.dark },
  eye: { minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 16, color: C.muted },
  tryDemo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  demoIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: C.pale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    paddingTop: 2,
    paddingBottom: 10,
  },
  footerText: { fontSize: 10, color: C.muted },
});
