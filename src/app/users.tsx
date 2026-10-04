import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, C, Chip, Empty, Field, Icon, Page, s } from '@/components/clean-ui';
import { Role, useStore } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
import { cloudErrorMessage } from '@/lib/cloud-errors';
import CloudUsers from '@/components/cloud-users';
export default function Users() {
  return firebaseConfigured ? <CloudUsers /> : <DemoUsers />;
}
function DemoUsers() {
  const { user, users, saveUser, login } = useStore();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Collector');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState('All');
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'Admin') return <Redirect href="/home" />;
  const filtered = users.filter(
    (p) =>
      (roleFilter === 'All' || p.role === roleFilter) &&
      `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Page title="Users" tab="Users">
      <View style={s.between}>
        <Text style={[s.title, { flex: 1 }]}>Our community</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={adding ? 'Close new profile form' : 'Add demo user'}
          accessibilityState={{ expanded: adding, disabled: busy }}
          disabled={busy}
          style={s.iconButton}
          onPress={() => {
            setAdding(!adding);
            setError('');
          }}
        >
          <Icon name={adding ? 'close-circle' : 'add-circle'} size={36} />
        </Pressable>
      </View>
      <Text style={s.muted}>
        Manage local demo profiles. Tap Try account to preview their assigned reports.
      </Text>
      {adding && (
        <View style={s.card}>
          <Text style={s.heading}>Add demo profile</Text>
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
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
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            editable={!busy}
          />
          <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
            {(['Resident', 'Collector', 'Admin'] as Role[]).map((r) => (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: role === r, disabled: busy }}
                disabled={busy}
                onPress={() => setRole(r)}
                style={[s.chip, role === r && s.chipActive]}
              >
                <Text style={{ fontSize: 12, color: role === r ? 'white' : C.dark }}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <Button
            title="Create demo profile"
            loading={busy}
            onPress={async () => {
              if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
                setError('Enter a name and valid email.');
                return;
              }
              if (users.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())) {
                setError('That email is already in use.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                await saveUser({
                  id: `user-${Date.now()}`,
                  name: name.trim(),
                  email: email.trim().toLowerCase(),
                  phone: '',
                  role,
                });
                setAdding(false);
                setName('');
                setEmail('');
              } catch (e) {
                setError(cloudErrorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      )}
      <Field
        label="Find a user"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, email, or role"
      />
      <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
        {['All', 'Resident', 'Collector', 'Admin'].map((label) => (
          <Chip
            key={label}
            title={label}
            selected={roleFilter === label}
            onPress={() => setRoleFilter(label)}
          />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.label}>
        {filtered.length} community {filtered.length === 1 ? 'member' : 'members'}
      </Text>
      {filtered.map((p) => (
        <View key={p.id} style={s.card}>
          <View style={s.row}>
            <View style={[s.logo, { backgroundColor: C.pale }]}>
              <Icon name="person-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>{p.name}</Text>
              <Text style={s.muted}>{p.role}</Text>
              {p.id === user.id && <Text style={[s.label, { color: C.green }]}>Your account</Text>}
              <Text style={[s.muted, { fontSize: 11 }]}>{p.email}</Text>
            </View>
          </View>
          {p.id !== user.id && (
            <Button
              title="Try account"
              secondary
              onPress={() => {
                login(p.id);
                router.replace('/home');
              }}
            />
          )}
        </View>
      ))}
      {!filtered.length && (
        <Empty
          text="No users match your search."
          icon="search-outline"
          action={{
            title: 'Clear search and filters',
            onPress: () => {
              setSearch('');
              setRoleFilter('All');
            },
          }}
        />
      )}
    </Page>
  );
}
