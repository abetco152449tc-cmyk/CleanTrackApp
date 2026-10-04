import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { compressReportPhoto } from '@/lib/report-photo';
import ReportLocation from '@/components/report-location';
import { Badge, Button, C, Empty, Field, Icon, Page, s } from '@/components/clean-ui';
import { Status, useStore, visibleReports } from '@/lib/store';
import { cloudErrorMessage } from '@/lib/cloud-errors';
import ReportEvidence from '@/components/report-evidence';
export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetails key={id} id={id} />;
}

function ReportDetails({ id }: { id: string }) {
  const { user, reports, users, updateReport, loadReport, releaseReport } = useStore();
  const [collector, setCollector] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const screenEpoch = useRef(0);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [completionPhoto, setCompletionPhoto] = useState('');
  const [loading, setLoading] = useState(!!loadReport);
  useFocusEffect(
    useCallback(() => {
      screenEpoch.current += 1;
      return () => {
        screenEpoch.current += 1;
      };
    }, []),
  );
  useEffect(() => {
    let active = true;
    if (loadReport)
      void loadReport(id)
        .catch((e) => {
          if (active) setError(cloudErrorMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
      releaseReport?.(id);
    };
  }, [id, loadReport, releaseReport, retry]);
  if (!user) return <Redirect href="/" />;
  const r = visibleReports(reports, user).find((x) => x.id === id);
  if (!r)
    return (
      <Page title="Report details" back>
        <Empty
          text={loading ? 'Loading report...' : 'This report is unavailable for your account.'}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {loadReport && !loading && (
          <Button
            title="Retry report"
            secondary
            onPress={() => {
              setError('');
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          />
        )}
        <Button title="Back to reports" onPress={() => router.replace('/reports')} />
      </Page>
    );
  async function update(status: Status) {
    if (!r || pending.current) return;
    if (status === 'Rejected' && !note.trim()) {
      setError('Please explain why the report was rejected.');
      return;
    }
    if (status === 'Resolved' && (!completionPhoto || !note.trim() || note.trim().length > 500)) {
      setError('Attach an after-cleanup photo and add a completion note of up to 500 characters.');
      return;
    }
    pending.current = true;
    const epoch = screenEpoch.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateReport(
        r.id,
        status,
        note.trim() ||
          (status === 'Assigned'
            ? 'Assigned to a garbage collector.'
            : status === 'Resolved'
              ? 'Garbage collected. Thank you for your report.'
              : `Status updated to ${status}.`),
        status === 'Assigned' ? collector : undefined,
        status === 'Resolved' ? completionPhoto : undefined,
      );
      if (epoch !== screenEpoch.current) return;
      setNote('');
      setError('');
      setMessage(
        status === 'Assigned'
          ? 'Assignment saved.'
          : status === 'Rejected'
            ? 'Report rejected. Your reason is saved in the timeline.'
            : status === 'Under Review'
              ? 'Report is now under review.'
              : 'Collection started.',
      );
      if (status === 'Resolved')
        router.replace({ pathname: '/success', params: { id: r.id, kind: 'collection' } });
    } catch (e) {
      if (epoch === screenEpoch.current) setError(cloudErrorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function pickCompletion(camera: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        throw Error('Camera access was denied. Choose an after-cleanup photo from your gallery.');
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled) {
        const asset = result.assets[0];
        setCompletionPhoto(await compressReportPhoto(asset.uri, asset.width, asset.height));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open cleanup photos.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Page title={user.role === 'Collector' ? 'Task details' : 'Report details'} back>
      {r.photosExpiredAt ? (
        <View style={s.card}>
          <Text style={s.muted}>
            Report photos were removed under the 180-day retention policy. The report and timeline
            are kept.
          </Text>
        </View>
      ) : r.hasPhoto ? (
        <ReportEvidence key={r.id} id={r.id} />
      ) : r.photo ? (
        <Image
          accessibilityLabel="Report evidence photo"
          source={{ uri: r.photo }}
          style={s.photo}
        />
      ) : (
        <View style={[s.photo, { justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
          <Icon name="trash-outline" size={70} />
          <Text style={s.muted}>No original photo attached</Text>
        </View>
      )}
      <View style={{ gap: 12 }}>
        <Badge status={r.status} />
        <Text style={s.title}>{r.title}</Text>
        <Text style={[s.muted, { fontSize: 11 }]}>{r.id}</Text>
      </View>
      <View style={s.card}>
        <View style={s.row}>
          <Icon name="location-outline" />
          <Text style={[s.muted, { flex: 1 }]}>{r.address}</Text>
        </View>
        <View style={s.row}>
          <Icon name="calendar-outline" />
          <Text style={s.muted}>{new Date(r.created).toLocaleString()}</Text>
        </View>
        <View style={s.row}>
          <Icon name="trash-outline" />
          <Text style={s.muted}>{r.type}</Text>
        </View>
        <Text style={s.muted}>{r.description}</Text>
        {r.collector && (
          <Text style={s.label}>
            Collector:{' '}
            {r.collectorName ||
              users.find((p) => p.id === r.collector)?.name ||
              'Assigned collector'}
          </Text>
        )}
      </View>
      <ReportLocation report={r} />
      {r.status === 'Resolved' && (
        <View style={s.card}>
          <Text style={s.heading}>After cleanup</Text>
          {r.photosExpiredAt ? (
            <Text style={s.muted}>Cleanup photo removed under the retention policy.</Text>
          ) : r.hasCompletionPhoto ? (
            <ReportEvidence key={`${r.id}-completion`} id={r.id} kind="completion" />
          ) : r.completionPhoto ? (
            <Image
              accessibilityLabel="After-cleanup evidence photo"
              source={{ uri: r.completionPhoto }}
              style={s.photo}
            />
          ) : (
            <Text style={s.muted}>This older report has no cleanup photo.</Text>
          )}
          <Text style={s.muted}>
            Review the cleanup photo alongside the original report photo and the completion note in
            the timeline.
          </Text>
        </View>
      )}
      <Button
        title="Open location in Maps"
        secondary
        onPress={() => {
          const q = r.latitude !== undefined ? `${r.latitude},${r.longitude}` : r.address;
          void Linking.openURL(
            r.latitude !== undefined && r.longitude !== undefined
              ? `https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`
              : `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`,
          ).catch(() => setError('Maps could not be opened.'));
        }}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!message && (
        <View accessibilityLiveRegion="polite" style={[s.card, { backgroundColor: C.pale }]}>
          <Text style={s.label}>{message}</Text>
        </View>
      )}
      {user.role === 'Admin' && ['Submitted', 'Under Review', 'Assigned'].includes(r.status) && (
        <View style={s.card}>
          <Text style={s.heading}>Manage report</Text>
          {r.status === 'Submitted' && (
            <Button
              title="Mark under review"
              disabled={busy}
              secondary
              onPress={() => void update('Under Review')}
            />
          )}
          <Text style={s.label}>Assign a collector</Text>
          {users
            .filter((p) => p.role === 'Collector')
            .map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityLabel={p.name}
                accessibilityState={{ checked: collector === p.id, disabled: busy }}
                disabled={busy}
                style={[
                  s.card,
                  { borderColor: collector === p.id ? C.green : C.border, padding: 12 },
                ]}
                onPress={() => setCollector(p.id)}
              >
                <View style={s.between}>
                  <View>
                    <Text style={s.label}>{p.name}</Text>
                    <Text style={s.muted}>
                      {
                        reports.filter(
                          (x) =>
                            x.collector === p.id && ['Assigned', 'In Progress'].includes(x.status),
                        ).length
                      }{' '}
                      active tasks
                    </Text>
                  </View>
                  <Icon name={collector === p.id ? 'radio-button-on' : 'radio-button-off'} />
                </View>
              </Pressable>
            ))}
          <Field
            label="Notes / rejection reason"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            editable={!busy}
            placeholder="Add instructions or explain the rejection"
          />
          {!users.some((p) => p.role === 'Collector') && (
            <Text style={s.muted}>
              No collectors yet. Approve a registered account in Users first.
            </Text>
          )}
          <Button
            title="Assign report"
            disabled={!collector || busy}
            onPress={() => void update('Assigned')}
          />
          {r.status !== 'Assigned' && (
            <Button
              title="Reject report"
              disabled={busy}
              secondary
              onPress={() => void update('Rejected')}
            />
          )}
        </View>
      )}
      {user.role === 'Collector' && ['Assigned', 'In Progress'].includes(r.status) && (
        <View style={s.card}>
          <Text style={s.heading}>Collection update</Text>
          {r.status === 'In Progress' && (
            <>
              <Text style={s.muted}>
                Take a clear photo of the cleaned area and describe what was collected. Both are
                required to complete this task.
              </Text>
              {!!completionPhoto && (
                <Image
                  accessibilityLabel="After-cleanup photo preview"
                  source={{ uri: completionPhoto }}
                  style={s.photo}
                />
              )}
              <Button
                title="Take after-cleanup photo"
                secondary
                disabled={busy}
                onPress={() => void pickCompletion(true)}
              />
              <Button
                title="Choose cleanup photo from gallery"
                secondary
                disabled={busy}
                onPress={() => void pickCompletion(false)}
              />
            </>
          )}
          <Field
            label={r.status === 'In Progress' ? 'Completion note' : 'Collection notes (optional)'}
            multiline
            maxLength={r.status === 'In Progress' ? 500 : 1000}
            editable={!busy}
            value={note}
            onChangeText={setNote}
            placeholder="Add an update about this collection"
          />
          <Button
            title={r.status === 'Assigned' ? 'Start collection' : 'Mark as collected'}
            disabled={busy || (r.status === 'In Progress' && (!completionPhoto || !note.trim()))}
            onPress={() => void update(r.status === 'Assigned' ? 'In Progress' : 'Resolved')}
          />
        </View>
      )}
      <Text style={s.heading}>Report timeline</Text>
      {[...r.history].reverse().map((h, i) => (
        <View key={i} style={s.row}>
          <View style={{ alignSelf: 'stretch', width: 25, alignItems: 'center' }}>
            <Icon name="checkmark-circle" size={21} />
            {i < r.history.length - 1 && (
              <View style={{ width: 2, flex: 1, minHeight: 35, backgroundColor: '#cde5d7' }} />
            )}
          </View>
          <View style={{ flex: 1, gap: 5, paddingBottom: 12 }}>
            <Text style={s.label}>{h.status}</Text>
            <Text style={s.muted}>{h.note}</Text>
            <Text style={[s.muted, { fontSize: 10 }]}>{new Date(h.date).toLocaleString()}</Text>
          </View>
        </View>
      ))}
    </Page>
  );
}
