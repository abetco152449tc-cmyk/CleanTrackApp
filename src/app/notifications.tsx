import { reportUpdates } from '@/lib/report-updates';
import PushSettings from '@/components/push-settings';
import ReportPagination from '@/components/report-pagination';
import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { Badge, Button, C, Empty, Icon, Page, s } from '@/components/clean-ui';
import { useStore, visibleReports } from '@/lib/store';
import { cloudErrorMessage } from '@/lib/cloud-errors';
export default function Notifications() {
  const { user, reports, readRevisions, markRead } = useStore();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  if (!user) return <Redirect href="/" />;
  const events = reportUpdates(reports, user, readRevisions);
  const shown = unreadOnly ? events.filter((event) => event.unread) : events;
  const unread = events.filter((event) => event.unread).length;
  return (
    <Page
      title="Updates"
      tab={user.role === 'Admin' ? undefined : 'Updates'}
      back={user.role === 'Admin'}
    >
      <Text style={s.title}>Your community inbox</Text>
      <Text style={s.muted}>
        {markRead
          ? 'Report assignments, cleanup completion and other status updates. Open an update to view its timeline.'
          : 'Report updates on this device. Push notifications are not connected.'}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {markRead && (
        <>
          <Text accessibilityLiveRegion="polite" style={s.label}>
            {unread} unread updates
          </Text>
          <Button
            title="Mark all as read"
            secondary
            loading={busy}
            disabled={!unread}
            onPress={async () => {
              setBusy(true);
              setError('');
              try {
                await markRead(visibleReports(reports, user));
              } catch (e) {
                setError(cloudErrorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      <Button
        title={unreadOnly ? 'Show all updates' : 'Show unread only'}
        secondary
        onPress={() => setUnreadOnly(!unreadOnly)}
      />
      {shown.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityHint="Open the report timeline"
          style={[s.card, s.row, e.unread && { borderColor: C.green, backgroundColor: C.pale }]}
          onPress={() => {
            setError('');
            router.push({ pathname: '/report/[id]', params: { id: e.report.id } });
            if (markRead)
              void markRead([e.report]).catch((error) => setError(cloudErrorMessage(error)));
          }}
        >
          <Icon
            name={e.status === 'Resolved' ? 'checkmark-circle' : 'notifications-outline'}
            size={29}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <Text style={s.label}>{e.message}</Text>
            <Badge status={e.status} />
            {markRead && e.unread && <Text style={s.label}>Unread</Text>}
            <Text style={s.label}>{e.report.title}</Text>
            {!!e.note && <Text style={s.muted}>{e.note}</Text>}
            <Text style={[s.muted, { fontSize: 11 }]}>{new Date(e.date).toLocaleString()}</Text>
          </View>
        </Pressable>
      ))}
      {!shown.length && (
        <Empty
          icon="checkmark-circle-outline"
          title={unreadOnly ? 'All caught up' : 'Your inbox is ready'}
          text="You are all caught up. New report updates will appear here."
          action={
            unreadOnly && events.length
              ? { title: 'Browse past updates', onPress: () => setUnreadOnly(false) }
              : undefined
          }
        />
      )}
      <Text style={s.muted}>
        Unread totals cover loaded history. Load older reports to include older updates.
      </Text>
      <ReportPagination />
      <PushSettings />
    </Page>
  );
}
