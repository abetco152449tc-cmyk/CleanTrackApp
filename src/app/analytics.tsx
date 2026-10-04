import ReportPagination from '@/components/report-pagination';
import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { C, Empty, Icon, Page, s, statusColors } from '@/components/clean-ui';
import { Status, useStore } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
export default function Analytics() {
  const { user, reports } = useStore();
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'Admin') return <Redirect href="/home" />;
  const resolved = reports.filter((report) => report.status === 'Resolved').length;
  const active = reports.filter(
    (report) => !['Resolved', 'Rejected'].includes(report.status),
  ).length;
  const resolutionRate = reports.length ? Math.round((resolved / reports.length) * 100) : 0;
  return (
    <Page title="Analytics" back>
      <Text style={s.title}>Progress you can see.</Text>
      <Text style={s.muted}>
        {firebaseConfigured
          ? 'Summary of currently loaded community reports. Load older pages to include more history.'
          : 'All-time report activity on this device, including sample reports.'}
      </Text>
      <View style={[s.card, { backgroundColor: C.green }]}>
        <Text style={{ color: '#bce5d0' }}>COMMUNITY REPORTS</Text>
        <Text style={{ color: 'white', fontSize: 55, fontWeight: '800' }}>{reports.length}</Text>
        <Text style={{ color: '#bce5d0' }}>
          {resolutionRate}% resolved · {resolved} cleanups completed
        </Text>
      </View>
      <View style={[s.row, { alignItems: 'stretch' }]}>
        <View style={[s.card, { flex: 1 }]}>
          <Icon name="time-outline" />
          <Text style={s.title}>{active}</Text>
          <Text style={s.muted}>Active reports</Text>
        </View>
        <View style={[s.card, { flex: 1 }]}>
          <Icon name="people-outline" />
          <Text style={s.title}>{new Set(reports.map((report) => report.resident)).size}</Text>
          <Text style={s.muted}>Residents reporting</Text>
        </View>
      </View>
      {!reports.length && (
        <Empty
          title="Ready for your first report"
          text="Community progress will appear as residents submit reports and collectors complete cleanups."
        />
      )}
      <Text style={s.heading}>Report status</Text>
      {(Object.keys(statusColors) as Status[]).map((status) => {
        const count = reports.filter((r) => r.status === status).length;
        return (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={`View ${status.toLowerCase()} reports, ${count}`}
            onPress={() => router.push({ pathname: '/reports', params: { status } })}
            style={({ pressed }) => ({ gap: 10, minHeight: 48, opacity: pressed ? 0.7 : 1 })}
          >
            <View style={s.between}>
              <Text style={s.label}>{status}</Text>
              <Text style={s.label}>
                {count} · {reports.length ? Math.round((count / reports.length) * 100) : 0}%
              </Text>
            </View>
            <View style={{ height: 12, backgroundColor: statusColors[status][0], borderRadius: 8 }}>
              <View
                style={{
                  height: 12,
                  width: `${reports.length ? (count / reports.length) * 100 : 0}%`,
                  backgroundColor: statusColors[status][1],
                  borderRadius: 8,
                }}
              />
            </View>
          </Pressable>
        );
      })}
      <Text style={s.heading}>Garbage categories</Text>
      {['General Waste', 'Recyclables', 'Illegal Dumping', 'Others'].map((type) => (
        <View key={type} style={[s.card, s.between]}>
          <Text style={s.label}>{type}</Text>
          <Text style={s.heading}>{reports.filter((r) => r.type === type).length}</Text>
        </View>
      ))}
      <ReportPagination />
    </Page>
  );
}
