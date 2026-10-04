import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Report } from '@/lib/store';
import LocationMap from './location-map';
import { Button, s } from './clean-ui';
import { reportMapHtml } from '@/lib/report-map-html';

export default function ReportMap({
  reports,
  preview = false,
}: {
  reports: Report[];
  preview?: boolean;
}) {
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const pins = useMemo(
    () => reports.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)),
    [reports],
  );
  const html = useMemo(() => reportMapHtml(pins, preview), [pins, preview]);
  const receive = useCallback(
    (text: string) => {
      try {
        const event = JSON.parse(text);
        if (event.type === 'error') setError(true);
        if (event.type === 'ready') setError(false);
        if (!preview && event.type === 'report' && pins.some((r) => r.id === event.id))
          router.push({ pathname: '/report/[id]', params: { id: event.id } });
      } catch {
        /* Ignore unrelated bridge messages. */
      }
    },
    [pins, preview],
  );
  if (!pins.length)
    return <Text style={s.muted}>No map pins saved. Use the report addresses below.</Text>;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: 300, overflow: 'hidden', borderRadius: 20 }}>
        <LocationMap key={retry} html={html} onMessage={receive} />
      </View>
      {error && (
        <>
          <Text accessibilityRole="alert" style={s.error}>
            Map could not load. Your saved address and coordinates are still available. Check your
            internet and retry.
          </Text>
          <Button
            title="Retry map"
            secondary
            onPress={() => {
              setError(false);
              setRetry((v) => v + 1);
            }}
          />
        </>
      )}
    </View>
  );
}
