import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { Report } from '@/lib/store';
import { s } from './clean-ui';
import ReportMap from './report-map';

export default function ReportLocation({
  report,
}: {
  report: Pick<
    Report,
    'address' | 'latitude' | 'longitude' | 'locationAccuracy' | 'locationSource'
  >;
}) {
  const { address, latitude, longitude, locationAccuracy, locationSource } = report;
  const pins = useMemo(
    () => [
      {
        address,
        latitude,
        longitude,
        locationAccuracy,
        id: 'location-preview',
        title: 'Selected location',
      } as Report,
    ],
    [address, latitude, longitude, locationAccuracy],
  );
  const pinned = Number.isFinite(latitude) && Number.isFinite(longitude);
  return (
    <View style={s.card}>
      <Text style={s.heading}>Saved report location</Text>
      <Text style={s.label}>{address}</Text>
      <Text style={s.muted}>
        {pinned
          ? `Map pin: ${latitude!.toFixed(6)}, ${longitude!.toFixed(6)}`
          : 'Address only. No map pin selected.'}
      </Text>
      {pinned && (
        <Text style={s.muted}>
          {locationAccuracy !== undefined
            ? `Estimated GPS accuracy: ${Math.round(locationAccuracy)} m.${locationAccuracy > 100 ? ' Approximate location; use the landmark to find the waste.' : ''}`
            : locationSource === 'map'
              ? 'Manually selected pin. GPS accuracy does not apply.'
              : 'Location accuracy was not recorded.'}
        </Text>
      )}
      {pinned && <ReportMap reports={pins} preview />}
    </View>
  );
}
