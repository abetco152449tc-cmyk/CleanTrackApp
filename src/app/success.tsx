import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, C, Icon, Page, s } from '@/components/clean-ui';
import { useStore } from '@/lib/store';
export default function Success() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const { user } = useStore();
  if (!user) return <Redirect href="/" />;
  return (
    <Page>
      <View style={{ paddingVertical: 65, alignItems: 'center', gap: 25 }}>
        <View
          style={{
            width: 130,
            height: 130,
            borderRadius: 65,
            backgroundColor: C.pale,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="checkmark-circle" size={95} />
        </View>
        <Text style={s.title}>
          {kind === 'collection' ? 'Task completed!' : 'Report submitted!'}
        </Text>
        <Text style={[s.muted, { textAlign: 'center' }]}>
          Thank you for taking action.{'\n'}Together, we make a cleaner community.
        </Text>
        <View style={[s.card, { width: '100%', alignItems: 'center' }]}>
          <Text style={s.muted}>Reference number</Text>
          <Text style={s.heading}>{id}</Text>
        </View>
      </View>
      <Button
        title="View report"
        onPress={() => router.replace({ pathname: '/report/[id]', params: { id } })}
      />
      <Button title="Back to home" secondary onPress={() => router.replace('/home')} />
    </Page>
  );
}
