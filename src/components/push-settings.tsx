import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { firebaseConfigured } from '@/lib/firebase';
import { disablePushDevice, pushDeviceEnabled, registerPushDevice } from '@/lib/push-notifications';
import { Button, s } from './clean-ui';

export default function PushSettings() {
  const { user } = useStore();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const uid = user?.id;
  useEffect(() => {
    let active = true;
    if (uid)
      void pushDeviceEnabled(uid)
        .then((value) => {
          if (active) setEnabled(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [uid]);
  if (!uid) return null;
  return (
    <View style={s.card}>
      <Text style={s.heading}>Phone notifications</Text>
      <Text style={s.muted}>
        {!firebaseConfigured
          ? 'The demo uses local in-app updates. Phone push needs your real account.'
          : Platform.OS === 'web'
            ? 'Use the installed phone app to enable push. Your in-app inbox works here.'
            : 'Get alerts when your report is assigned or cleaned up, or when a new collection task arrives. Push delivery also needs the project notification worker.'}
      </Text>
      {firebaseConfigured && Platform.OS !== 'web' && (
        <>
          <Text style={s.label}>
            {enabled ? 'This device is registered for push' : 'Phone push is off on this device'}
          </Text>
          <Button
            title={
              busy
                ? 'Updating notifications...'
                : enabled
                  ? 'Disable phone notifications'
                  : 'Enable phone notifications'
            }
            secondary
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setMessage('');
              try {
                if (enabled) await disablePushDevice(uid);
                else await registerPushDevice(uid);
                setEnabled(!enabled);
                setMessage(
                  enabled
                    ? 'Phone notifications disabled. In-app updates stay available.'
                    : 'Device registered. Push alerts will arrive when delivery is configured and running.',
                );
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Could not update notifications. Try again.',
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            title="Open notification settings"
            secondary
            disabled={busy}
            onPress={() => {
              void Linking.openSettings().catch(() =>
                setMessage(
                  'Open your phone Settings to change CleanTrack notification permissions.',
                ),
              );
            }}
          />
        </>
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={s.muted}>
          {message}
        </Text>
      )}
    </View>
  );
}
