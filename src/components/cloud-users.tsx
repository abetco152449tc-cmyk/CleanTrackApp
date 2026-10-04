import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, C, Chip, Empty, Field, Icon, Page, s } from './clean-ui';
import { useStore } from '@/lib/store';
import { cloudErrorMessage } from '@/lib/cloud-errors';

export default function CloudUsers() {
  const { user, users, promoteCollector } = useStore();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [roleFilter, setRoleFilter] = useState('All');
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'Admin') return <Redirect href="/home" />;
  const filtered = users.filter(
    (person) =>
      (roleFilter === 'All' || person.role === roleFilter) &&
      `${person.name} ${person.email} ${person.role}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <Page title="Users" tab="Users">
      <Text style={s.title}>Our community</Text>
      <Text style={s.muted}>
        Ask a collector to register an account, then approve their access here. They will
        automatically see their task dashboard. Showing up to 500 accounts.
      </Text>
      <Field
        label="Find a user"
        placeholder="Name, email, or role"
        value={search}
        onChangeText={setSearch}
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
      {!!message && (
        <Text
          accessibilityRole={failed ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          style={failed ? s.error : [s.card, { color: C.green }]}
        >
          {message}
        </Text>
      )}
      {filtered.map((person) => (
        <View style={s.card} key={person.id}>
          <View style={s.row}>
            <View style={[s.logo, { backgroundColor: C.pale }]}>
              <Icon name="person-outline" />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heading}>{person.name}</Text>
              <Text style={s.muted}>{person.email}</Text>
              <Text style={[s.label, { color: C.green }]}>
                {person.role}
                {person.id === user.id ? ' · Your account' : ''}
              </Text>
            </View>
          </View>
          {!!person.phone && <Text style={s.muted}>{person.phone}</Text>}
          {person.role === 'Resident' &&
            (selected === person.id ? (
              <>
                <Text style={s.muted}>
                  Approve {person.name} as a collector? They will gain access to assigned collection
                  tasks.
                </Text>
                <Button
                  title="Confirm collector access"
                  loading={busy}
                  onPress={async () => {
                    setBusy(true);
                    setMessage('');
                    setFailed(false);
                    try {
                      if (!promoteCollector)
                        throw new Error(
                          'Collector approval is unavailable. Reload the app and try again.',
                        );
                      await promoteCollector(person.id);
                      setSelected('');
                      setMessage(`${person.name} can now use the Collector dashboard.`);
                    } catch (e) {
                      setFailed(true);
                      setMessage(cloudErrorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <Button title="Cancel" secondary disabled={busy} onPress={() => setSelected('')} />
              </>
            ) : (
              <Button
                title="Approve as collector"
                secondary
                disabled={busy}
                onPress={() => {
                  setSelected(person.id);
                  setMessage('');
                }}
              />
            ))}
        </View>
      ))}
      {!filtered.length && (
        <Empty
          text="No accounts match your search."
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
