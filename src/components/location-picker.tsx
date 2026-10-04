import { useCallback, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, C, s } from './clean-ui';
import LocationMap from './location-map';
import { parseMapCoordinate, type MapCoordinate } from '@/lib/location-map-html';

export default function LocationPicker({
  initial,
  onConfirm,
  onClose,
}: {
  initial?: MapCoordinate;
  onConfirm: (coordinate: MapCoordinate) => void;
  onClose: () => void;
}) {
  const [candidate, setCandidate] = useState<MapCoordinate>();
  const [error, setError] = useState(false);
  const receive = useCallback((text: string) => {
    try {
      const message = JSON.parse(text);
      if (message.type === 'position') {
        setCandidate(parseMapCoordinate(message));
        setError(false);
      } else if (message.type === 'moving' || message.type === 'error') {
        setCandidate(undefined);
        setError(message.type === 'error');
      }
    } catch {
      /* Ignore messages that are not map events. */
    }
  }, []);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ padding: 20, gap: 8 }}>
          <Text style={s.heading}>Pinpoint the waste</Text>
          <Text style={s.muted}>
            Move the map under the pin. Pinch to zoom, or tap the exact spot.
          </Text>
          {!initial && (
            <Text style={s.muted}>Starting in Tagum City. Move to your report location.</Text>
          )}
        </View>
        <View style={{ flex: 1, backgroundColor: C.pale }}>
          <LocationMap initial={initial} onMessage={receive} />
        </View>
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={error ? s.error : s.muted}>
            {error
              ? 'Map could not load. Check your internet, then close and reopen it. You can also enter an address instead.'
              : candidate
                ? `${candidate.latitude.toFixed(6)}, ${candidate.longitude.toFixed(6)}`
                : 'Positioning the pin…'}
          </Text>
          <Button
            title="Confirm this location"
            disabled={!candidate}
            onPress={() => candidate && onConfirm(candidate)}
          />
          <Button title="Cancel" secondary onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
