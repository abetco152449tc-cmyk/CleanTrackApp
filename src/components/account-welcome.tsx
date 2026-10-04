import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Button, C, Field, Icon, Logo, Page, s } from './clean-ui';
import { getFirebaseAuth } from '@/lib/firebase-auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { useStore } from '@/lib/store';

export default function AccountWelcome() {
  const { user } = useStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (user) return <Redirect href="/home" />;

  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setError('');
    setMessage('');
    setVisible(false);
  }
  async function submit() {
    if (pending.current) return;
    setError('');
    setMessage('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'reset' && !password) {
      setError('Enter your password.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (mode === 'register' && password !== confirmation) {
      setError('Your passwords do not match.');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage(
          'If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.',
        );
      } else if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        setPassword('');
        setConfirmation('');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setPassword('');
      }
    } catch (e) {
      if (mode === 'reset' && (e as { code?: string }).code === 'auth/user-not-found') {
        setMessage(
          'If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.',
        );
      } else setError(authErrorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Page>
      <View style={s.between}>
        <Logo />
        <View style={styles.connected}>
          <Icon name="shield-checkmark-outline" size={14} />
          <Text style={styles.connectedText}>SECURE LOGIN</Text>
        </View>
      </View>
      <View style={styles.hero}>
        <View style={styles.heroCircle} />
        <View style={styles.heroIcon}>
          <Icon name="leaf-outline" size={27} color="#e5f8ed" />
        </View>
        <Text style={styles.heroEyebrow}>YOUR COMMUNITY. YOUR IMPACT.</Text>
        <Text style={styles.heroTitle}>A cleaner community{'\n'}starts with you.</Text>
        <Text style={styles.heroDescription}>
          Report waste, follow the cleanup, and see the difference we make together.
        </Text>
      </View>
      <View style={{ gap: 7 }}>
        <Text style={s.title}>
          {mode === 'register'
            ? 'Join CleanTrack.'
            : mode === 'reset'
              ? 'Reset your password.'
              : 'Welcome back.'}
        </Text>
        <Text style={s.muted}>
          {mode === 'register'
            ? 'Create your resident account with your email and password.'
            : mode === 'reset'
              ? 'We will send a link so you can choose a new password.'
              : 'Sign in to CleanTrack. Your account opens the right dashboard automatically.'}
        </Text>
      </View>
      <View style={[s.card, { gap: 18 }]}>
        <Text style={s.heading}>
          {mode === 'register'
            ? 'Your new account'
            : mode === 'reset'
              ? 'Password recovery'
              : 'Sign in'}
        </Text>
        <Field
          label="Email address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
            setMessage('');
          }}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          returnKeyType={mode === 'reset' ? 'send' : 'next'}
          onSubmitEditing={mode === 'reset' ? () => void submit() : undefined}
        />
        {mode !== 'reset' && (
          <>
            <Field
              label="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              editable={!busy}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
              returnKeyType={mode === 'register' ? 'next' : 'go'}
              onSubmitEditing={mode === 'login' ? () => void submit() : undefined}
            />
            {mode === 'register' && (
              <Field
                label="Confirm password"
                value={confirmation}
                onChangeText={(value) => {
                  setConfirmation(value);
                  setError('');
                }}
                editable={!busy}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={visible ? 'Hide password' : 'Show password'}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => setVisible(!visible)}
              style={styles.reveal}
            >
              <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={17} />
              <Text style={styles.link}>{visible ? 'Hide password' : 'Show password'}</Text>
            </Pressable>
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!!message && (
          <Text accessibilityRole="alert" style={s.muted}>
            {message}
          </Text>
        )}
        <Button
          title={
            busy
              ? 'Please wait…'
              : mode === 'register'
                ? 'Create resident account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : 'Log in'
          }
          disabled={busy}
          onPress={() => void submit()}
        />
        {mode === 'login' ? (
          <>
            <Button
              title="Create an account"
              secondary
              disabled={busy}
              onPress={() => changeMode('register')}
            />
            <Button
              title="Forgot password?"
              secondary
              disabled={busy}
              onPress={() => changeMode('reset')}
            />
          </>
        ) : (
          <Button
            title="Back to login"
            secondary
            disabled={busy}
            onPress={() => changeMode('login')}
          />
        )}
        <View style={[s.row, { justifyContent: 'center', gap: 7 }]}>
          <Icon name="lock-closed-outline" size={14} color={C.muted} />
          <Text style={[s.muted, { fontSize: 11 }]}>
            Your reports are shared with your barangay team.
          </Text>
        </View>
      </View>
      
    </Page>
  );
}

const styles = StyleSheet.create({
  connected: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connectedText: { color: C.green, fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  hero: { backgroundColor: '#075b43', borderRadius: 24, padding: 24, gap: 10, overflow: 'hidden' },
  heroCircle: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#ffffff09',
    right: -80,
    top: -65,
  },
  heroIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: '#ffffff15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    color: '#c0e7d2',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginTop: 5,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroDescription: { color: '#d3ebde', fontSize: 12, lineHeight: 20, maxWidth: 400 },
  reveal: {
    minHeight: 44,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
    marginTop: -8,
  },
  link: { color: C.green, fontSize: 12, fontWeight: '600' },
});
