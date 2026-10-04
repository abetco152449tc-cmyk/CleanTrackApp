import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { Button, s } from './clean-ui';
import { getFirebaseServices } from '@/lib/firebase';
import { cloudErrorMessage } from '@/lib/cloud-errors';

export default function ReportEvidence({
  id,
  kind = 'main',
}: {
  id: string;
  kind?: 'main' | 'completion';
}) {
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void getDoc(doc(getFirebaseServices().db, 'reports', id, 'evidence', kind))
      .then((snapshot) => {
        if (!active) return;
        const value = snapshot.data()?.dataUrl;
        if (typeof value === 'string' && value.startsWith('data:image/jpeg;base64,')) {
          setPhoto(value);
          setError('');
        } else setError('This report photo is unavailable.');
      })
      .catch((e) => {
        if (active) setError(cloudErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, kind, retry]);
  if (photo)
    return (
      <Image
        accessibilityLabel={
          kind === 'completion' ? 'After-cleanup evidence photo' : 'Report evidence photo'
        }
        source={{ uri: photo }}
        style={s.photo}
      />
    );
  return (
    <View style={s.card}>
      <Text style={s.muted}>{error || 'Loading report photo…'}</Text>
      {!!error && <Button title="Retry photo" secondary onPress={() => setRetry((v) => v + 1)} />}
    </View>
  );
}
