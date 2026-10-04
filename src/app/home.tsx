import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { C, Empty, Icon, Page, ReportCard, s, statusColors } from '@/components/clean-ui';
import { Status, useStore, visibleReports } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
export default function Home() {
  const { user, reports, hasMoreReports } = useStore();
  if (!user) return <Redirect href="/" />;
  const mine = visibleReports(reports, user).sort((a, b) => b.created.localeCompare(a.created));
  const statuses: Status[] =
    user.role === 'Collector'
      ? ['Assigned', 'In Progress', 'Resolved']
      : ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];
  const active = mine.filter((report) => !['Resolved', 'Rejected'].includes(report.status));
  const recent = user.role === 'Collector' && active.length ? active : mine;
  return (
    <Page title="Home" tab="Home">
      <View style={s.between}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>{user.role.toUpperCase()} PORTAL</Text>
          <Text style={s.title}>Hello, {user.name.trim().split(/\s+/)[0]}</Text>
        </View>
      </View>
      <Text style={[s.muted, { marginTop: -15 }]}>
        A little care goes a long way. Let us keep our barangay clean.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          user.role === 'Resident' ? 'Create a waste report' : 'Open your report dashboard'
        }
        onPress={() => router.push(user.role === 'Resident' ? '/new-report' : '/reports')}
        style={({ pressed }) => ({
          backgroundColor: C.green,
          padding: 24,
          borderRadius: 24,
          gap: 17,
          overflow: 'hidden',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={s.between}>
          <View style={{ backgroundColor: '#ffffff22', padding: 12, borderRadius: 14 }}>
            <Icon
              name={user.role === 'Resident' ? 'camera-outline' : 'leaf-outline'}
              color="white"
              size={27}
            />
          </View>
          <Icon name="arrow-forward" color="#b9e3ce" />
        </View>
        <Text style={{ color: 'white', fontSize: 25, fontWeight: '700' }}>
          {user.role === 'Resident'
            ? 'See it. Report it.'
            : user.role === 'Collector'
              ? 'A cleaner route starts here.'
              : 'A community that cares.'}
        </Text>
        <Text style={{ color: '#c6e8d7', lineHeight: 20, fontSize: 13 }}>
          {user.role === 'Resident'
            ? 'Snap a photo and we will take it from there.'
            : user.role === 'Collector'
              ? `${active.length} active ${active.length === 1 ? 'task' : 'tasks'} ready for your attention. Open a task to start collection.`
              : 'Review new reports, assign collectors, and follow cleanup progress.'}
        </Text>
        <View style={[s.row, { gap: 6 }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            {user.role === 'Resident'
              ? 'Make a report'
              : user.role === 'Collector'
                ? 'View tasks'
                : 'Manage reports'}
          </Text>
          <Icon name="arrow-forward" color="#fff" size={16} />
        </View>
      </Pressable>
      <View style={[s.row, { alignItems: 'stretch' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={user.role === 'Collector' ? 'Task map' : 'Report map'}
          onPress={() => router.push('/map')}
          style={({ pressed }) => [
            s.card,
            { flex: 1, padding: 15 },
            pressed && { backgroundColor: C.pale },
          ]}
        >
          <Icon name="map-outline" />
          <Text style={s.label}>{user.role === 'Collector' ? 'Task map' : 'Report map'}</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>Find saved locations</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={user.role === 'Admin' ? 'Community members' : 'Report updates'}
          onPress={() => router.push(user.role === 'Admin' ? '/users' : '/notifications')}
          style={({ pressed }) => [
            s.card,
            { flex: 1, padding: 15 },
            pressed && { backgroundColor: C.pale },
          ]}
        >
          <Icon name={user.role === 'Admin' ? 'people-outline' : 'notifications-outline'} />
          <Text style={s.label}>
            {user.role === 'Admin' ? 'Community members' : 'Report updates'}
          </Text>
          <Text style={[s.muted, { fontSize: 12 }]}>
            {user.role === 'Admin' ? 'Manage collector access' : 'Follow cleanup progress'}
          </Text>
        </Pressable>
      </View>
      <View style={s.between}>
        <Text style={s.heading}>{user.role === 'Collector' ? 'Your impact' : 'At a glance'}</Text>
        <Text style={s.muted}>
          {mine.length} {user.role === 'Collector' ? 'tasks' : 'reports'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {statuses.map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={`View ${status.toLowerCase()} ${user.role === 'Collector' ? 'tasks' : 'reports'}`}
            onPress={() => router.push({ pathname: '/reports', params: { status } })}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: '45%',
              backgroundColor: statusColors[status][0],
              borderRadius: 15,
              padding: 16,
              gap: 10,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={s.between}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.dark }}>
                {mine.filter((r) => r.status === status).length}
              </Text>
              <Icon
                name={status === 'Resolved' ? 'checkmark-circle' : 'ellipse-outline'}
                color={statusColors[status][1]}
                size={21}
              />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: statusColors[status][1] }}>
              {status}
            </Text>
          </Pressable>
        ))}
      </View>
      {firebaseConfigured && hasMoreReports && (
        <Text style={[s.muted, { fontSize: 12, marginTop: -10 }]}>
          Totals cover loaded reports. Open the full list to load more history.
        </Text>
      )}
      <View style={s.between}>
        <Text style={s.heading}>
          {user.role === 'Collector' && active.length ? 'Ready for collection' : 'Recent reports'}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push('/reports')}>
          <Text style={{ color: C.green, fontWeight: '600', fontSize: 13 }}>View all</Text>
        </Pressable>
      </View>
      <View style={{ gap: 10 }}>
        {recent.slice(0, 3).map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
        {!mine.length && (
          <Empty
            title={user.role === 'Collector' ? 'Ready when you are' : 'A fresh start'}
            text={
              user.role === 'Collector'
                ? 'Assigned collection tasks will appear here.'
                : 'Your reports will appear here.'
            }
            action={
              user.role === 'Resident'
                ? { title: 'Create your first report', onPress: () => router.push('/new-report') }
                : undefined
            }
          />
        )}
      </View>
      {user.role === 'Admin' && (
        <Pressable
          accessibilityRole="button"
          style={s.card}
          onPress={() => router.push('/analytics')}
        >
          <View style={s.between}>
            <Text style={s.heading}>Community analytics</Text>
            <Icon name="bar-chart-outline" />
          </View>
          <Text style={s.muted}>See collection progress and waste categories.</Text>
        </Pressable>
      )}
      <View style={[s.row, { padding: 15, backgroundColor: '#edf4e9', borderRadius: 16 }]}>
        <Icon name="sparkles-outline" />
        <View style={{ flex: 1 }}>
          <Text style={s.label}>A small habit, a big difference</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>
            Separate recyclables before putting out your waste.
          </Text>
        </View>
      </View>
    </Page>
  );
}
