import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, C, Field, Icon, Page, s } from '@/components/clean-ui';
import { useStore, visibleReports } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
import { cloudErrorMessage } from '@/lib/cloud-errors';
import PushSettings from '@/components/push-settings';
export default function Profile() {
  const { user, saveUser, logout, reports } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return <Redirect href="/" />;
  const resolved = visibleReports(reports, user).filter((r) => r.status === 'Resolved').length;
  return (
    <Page title="Profile" tab="Profile">
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
        <View
          style={{
            width: 90,
            height: 90,
            borderRadius: 45,
            backgroundColor: C.pale,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 32, fontWeight: '800', color: C.green }}>
            {user.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </Text>
        </View>
        <Text style={[s.title, { textAlign: 'center' }]}>{user.name}</Text>
        <Text style={s.muted}>
          {user.role} · {firebaseConfigured ? 'Community member' : 'Local demo profile'}
        </Text>
        <Text style={s.muted}>{user.email}</Text>
      </View>
      <View style={[s.card, s.between]}>
        <View>
          <Text style={s.title}>{resolved}</Text>
          <Text style={s.muted}>Reports resolved</Text>
        </View>
        <Icon name="leaf-outline" size={40} />
      </View>
      {!!message && (
        <Text
          accessibilityRole={failed ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          style={failed ? s.error : [s.card, { color: C.green }]}
        >
          {message}
        </Text>
      )}
      {editing ? (
        <View style={s.card}>
          <Text style={s.heading}>Your details</Text>
          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            editable={!busy}
          />
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            maxLength={254}
            editable={!firebaseConfigured && !busy}
          />
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={30}
            editable={!busy}
          />
          <Button
            title="Save changes"
            loading={busy}
            onPress={async () => {
              if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
                setFailed(true);
                setMessage('Enter a name and a valid email address.');
                return;
              }
              setBusy(true);
              setFailed(false);
              setMessage('');
              try {
                await saveUser({
                  ...user,
                  name: name.trim(),
                  email: email.trim(),
                  phone: phone.trim(),
                });
                setEditing(false);
                setMessage(
                  firebaseConfigured ? 'Your profile was saved.' : 'Profile saved on this device.',
                );
              } catch (e) {
                setFailed(true);
                setMessage(cloudErrorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          {firebaseConfigured && (
            <Text style={s.muted}>
              You can update your name and phone here. Your sign-in email stays unchanged.
            </Text>
          )}
          <Button
            title="Cancel"
            disabled={busy}
            secondary
            onPress={() => {
              setEditing(false);
              setMessage('');
            }}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={[s.card, s.between]}
          onPress={() => {
            setName(user.name);
            setEmail(user.email);
            setPhone(user.phone);
            setMessage('');
            setEditing(true);
          }}
        >
          <View style={s.row}>
            <Icon name="person-outline" />
            <Text style={s.label}>Edit profile</Text>
          </View>
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        style={[s.card, s.between]}
        onPress={() => router.push('/notifications')}
      >
        <View style={s.row}>
          <Icon name="notifications-outline" />
          <Text style={s.label}>Report updates</Text>
        </View>
        <Icon name="chevron-forward" size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={[s.card, s.between]}
        onPress={() => router.push('/map')}
      >
        <View style={s.row}>
          <Icon name="map-outline" />
          <Text style={s.label}>{user.role === 'Collector' ? 'Task map' : 'Report map'}</Text>
        </View>
        <Icon name="chevron-forward" size={18} />
      </Pressable>
      <PushSettings />
      <Button
        title={firebaseConfigured ? 'Log out' : 'Switch demo account'}
        loading={busy}
        secondary
        onPress={async () => {
          setBusy(true);
          setFailed(false);
          setMessage('');
          try {
            await logout();
            router.replace('/');
          } catch (e) {
            setFailed(true);
            setMessage(cloudErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}
