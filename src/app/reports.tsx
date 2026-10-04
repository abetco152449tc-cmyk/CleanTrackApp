import ReportPagination from '@/components/report-pagination';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, C, Chip, Empty, Field, Icon, Page, ReportCard, s } from '@/components/clean-ui';
import { useStore, visibleReports } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
export default function Reports() {
  const { user, reports } = useStore();
  const params = useLocalSearchParams<{ status?: string }>();
  const [search, setSearch] = useState('');
  const [oldestFirst, setOldestFirst] = useState(false);
  if (!user) return <Redirect href="/" />;
  const filters = [
    'All',
    ...(user.role === 'Collector'
      ? ['Assigned', 'In Progress', 'Resolved']
      : ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected']),
  ];
  const filter = filters.includes(params.status ?? '') ? params.status! : 'All';
  const all = visibleReports(reports, user);
  const filtered = search.trim() !== '' || filter !== 'All';
  const mine = all
    .filter(
      (r) =>
        (filter === 'All' || r.status === filter) &&
        `${r.title} ${r.address} ${r.id} ${r.type}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      oldestFirst ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created),
    );
  const clearFilters = () => {
    setSearch('');
    router.setParams({ status: '' });
  };
  return (
    <Page title="Reports" tab={user.role === 'Collector' ? 'Tasks' : 'Reports'}>
      <Text style={s.title}>
        {user.role === 'Collector'
          ? 'My tasks'
          : user.role === 'Admin'
            ? 'Community reports'
            : 'My reports'}
      </Text>
      <Text style={[s.muted, { marginTop: -15 }]}>
        {firebaseConfigured
          ? 'Your newest reports update automatically. Load older pages to browse your history.'
          : 'Every report is a step toward a cleaner barangay.'}
      </Text>
      <Field
        label="Search reports"
        placeholder="Title, location, category, or reference"
        value={search}
        onChangeText={setSearch}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {filters.map((f) => (
          <Chip
            key={f}
            title={f}
            selected={filter === f}
            onPress={() => router.setParams({ status: f === 'All' ? '' : f })}
          />
        ))}
      </ScrollView>
      <View style={s.between}>
        <Text accessibilityLiveRegion="polite" style={s.label}>
          {mine.length}{' '}
          {user.role === 'Collector'
            ? mine.length === 1
              ? 'task'
              : 'tasks'
            : mine.length === 1
              ? 'report'
              : 'reports'}
          {filtered ? ' found' : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={oldestFirst ? 'Sort newest first' : 'Sort oldest first'}
          onPress={() => setOldestFirst(!oldestFirst)}
          style={[s.row, { minHeight: 44, gap: 6 }]}
        >
          <Icon name="swap-vertical-outline" size={16} />
          <Text style={{ fontSize: 12, color: C.green }}>
            {oldestFirst ? 'Oldest first' : 'Newest first'}
          </Text>
        </Pressable>
      </View>
      {user.role === 'Resident' && mine.length > 0 && (
        <Button title="Create a report" onPress={() => router.push('/new-report')} />
      )}
      <View style={{ gap: 10 }}>
        {mine.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
        {!mine.length && (
          <Empty
            icon={filtered ? 'search-outline' : 'document-text-outline'}
            title={
              filtered
                ? 'No matches yet'
                : user.role === 'Collector'
                  ? 'No assigned tasks'
                  : 'No reports yet'
            }
            text={
              filtered
                ? 'No reports match your search.'
                : user.role === 'Collector'
                  ? 'Your barangay admin will assign collection tasks here.'
                  : 'Every report helps keep your barangay clean.'
            }
            action={
              filtered
                ? { title: 'Clear search and filters', onPress: clearFilters }
                : user.role === 'Resident'
                  ? { title: 'Create your first report', onPress: () => router.push('/new-report') }
                  : undefined
            }
          />
        )}
      </View>
      <ReportPagination />
    </Page>
  );
}
