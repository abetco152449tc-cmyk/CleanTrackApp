import ReportPagination from '@/components/report-pagination';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Chip, Empty, Icon, Page, ReportCard, s } from '@/components/clean-ui';
import ReportMap from '@/components/report-map';
import { useStore, visibleReports } from '@/lib/store';
export default function Map() {
  const { user, reports } = useStore();
  const [filter, setFilter] = useState('Active');
  if (!user) return <Redirect href="/" />;
  const mine = visibleReports(reports, user);
  const shown = mine.filter(
    (report) =>
      filter === 'All' ||
      (filter === 'Resolved'
        ? report.status === 'Resolved'
        : !['Resolved', 'Rejected'].includes(report.status)),
  );
  const pins = shown.filter(
    (report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude),
  );
  const addressOnly = shown.length - pins.length;
  return (
    <Page
      title="Map"
      tab={user.role === 'Resident' ? undefined : 'Map'}
      back={user.role === 'Resident'}
    >
      <Text style={s.title}>
        {user.role === 'Collector' ? 'Your collection map' : 'Around your barangay'}
      </Text>
      <Text style={s.muted}>
        {user.role === 'Resident'
          ? 'Find the locations of your reports and follow their progress.'
          : 'Locate reports and plan the next cleanup.'}
      </Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
        {['Active', 'All', 'Resolved'].map((label) => (
          <Chip
            key={label}
            title={label}
            selected={filter === label}
            onPress={() => setFilter(label)}
          />
        ))}
      </View>
      {shown.length > 0 && (
        <>
          <View style={[s.card, s.row, { padding: 14 }]}>
            <Icon name="location-outline" />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>
                {pins.length} mapped · {addressOnly} address only
              </Text>
              <Text style={[s.muted, { fontSize: 12 }]}>
                Tap a pin, then Open report. Accuracy circles appear for GPS locations. Internet is
                required for the map.
              </Text>
            </View>
          </View>
          <ReportMap reports={shown} />
          <Text style={s.heading}>Report locations</Text>
          {addressOnly > 0 && (
            <Text style={s.muted}>
              Address-only reports can still be opened in your Maps app from their details.
            </Text>
          )}
        </>
      )}
      {shown.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
      {!shown.length && (
        <Empty
          icon="map-outline"
          title={mine.length ? `No ${filter.toLowerCase()} reports` : 'Your map starts here'}
          text={
            mine.length
              ? 'Choose another filter to see your saved report locations.'
              : user.role === 'Collector'
                ? 'Assigned reports will appear here when your admin adds collection tasks.'
                : 'Reports with a saved location will appear on this map.'
          }
          action={
            mine.length
              ? { title: 'Show all reports', onPress: () => setFilter('All') }
              : user.role === 'Resident'
                ? { title: 'Create a report', onPress: () => router.push('/new-report') }
                : undefined
          }
        />
      )}
      <ReportPagination />
    </Page>
  );
}
