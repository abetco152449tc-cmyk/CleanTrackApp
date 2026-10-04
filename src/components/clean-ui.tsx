import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Report, Status, useStore } from '@/lib/store';
import { unreadReportUpdates } from '@/lib/report-updates';
export const C = {
  green: '#087f5b',
  dark: '#112c32',
  muted: '#60736d',
  pale: '#e8f5ee',
  border: '#e4ece8',
  bg: '#f7faf9',
};
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 22,
  color = C.green,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Logo() {
  return (
    <View style={s.row}>
      <View style={s.logo}>
        <Icon name="leaf" color="white" size={25} />
      </View>
      <View>
        <Text style={s.brand}>
          CleanTrack<Text style={{ color: C.green }}>.</Text>
        </Text>
        <Text style={s.eyebrow}>A CLEANER TOMORROW</Text>
      </View>
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading && <ActivityIndicator color={secondary ? C.green : '#fff'} size="small" />}
      <Text style={{ color: secondary ? C.green : '#fff', fontWeight: '700', fontSize: 15 }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#92a19c"
        {...props}
        style={[
          s.input,
          props.multiline && { height: 110, textAlignVertical: 'top' },
          props.editable === false && { backgroundColor: '#edf2ef', color: C.muted },
          props.style,
        ]}
      />
    </View>
  );
}
export const statusColors: Record<Status, [string, string]> = {
  Submitted: ['#e9f2ff', '#2774ce'],
  'Under Review': ['#fff4d9', '#9a6a08'],
  Assigned: ['#eeebff', '#6f55c2'],
  'In Progress': ['#fff0de', '#bb710b'],
  Resolved: ['#def4e8', '#087f5b'],
  Rejected: ['#ffe8e8', '#bc4949'],
};
export function Badge({ status }: { status: Status }) {
  const [backgroundColor, color] = statusColors[status];
  return (
    <View style={[s.badge, { backgroundColor }]}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{status}</Text>
    </View>
  );
}
export function Chip({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={{ color: selected ? '#fff' : C.muted, fontSize: 12, fontWeight: '600' }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Empty({
  text,
  title,
  action,
  icon = 'leaf-outline',
}: {
  text: string;
  title?: string;
  action?: { title: string; onPress: () => void };
  icon?: IconName;
}) {
  return (
    <View style={[s.card, { alignItems: 'center', padding: 28, gap: 14 }]}>
      <View style={[s.logo, { width: 62, height: 62, backgroundColor: C.pale, borderRadius: 21 }]}>
        <Icon name={icon} size={30} />
      </View>
      {title && <Text style={[s.heading, { textAlign: 'center' }]}>{title}</Text>}
      <Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text>
      {action && <Button title={action.title} onPress={action.onPress} secondary />}
    </View>
  );
}
export function ReportCard({ report }: { report: Report }) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const created = new Date(report.created);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Open report details and its status timeline"
      onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
      style={({ pressed }) => [
        s.card,
        { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
        pressed && { backgroundColor: C.pale },
      ]}
    >
      {report.photo && failedPhoto !== report.photo ? (
        <Image
          source={{ uri: report.photo }}
          onError={() => setFailedPhoto(report.photo)}
          style={{ width: 66, height: 85, borderRadius: 12, backgroundColor: C.pale }}
        />
      ) : (
        <View
          style={{
            width: 66,
            height: 85,
            borderRadius: 12,
            backgroundColor: C.pale,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={report.type === 'Illegal Dumping' ? 'warning-outline' : 'trash-outline'}
            size={30}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text numberOfLines={2} style={[s.label, { fontSize: 14 }]}>
          {report.title}
        </Text>
        <Text numberOfLines={1} style={{ color: C.muted, fontSize: 11 }}>
          {report.address || 'Location unavailable'}
        </Text>
        <View style={[s.row, { flexWrap: 'wrap', gap: 7 }]}>
          <Badge status={report.status} />
          {!Number.isNaN(created.getTime()) && (
            <Text style={{ color: C.muted, fontSize: 10 }}>
              {created.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          )}
        </View>
      </View>
      <Icon name="chevron-forward" size={16} color={C.muted} />
    </Pressable>
  );
}
export function Page({
  children,
  title,
  back,
  tab,
  contentStyle,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  tab?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { ready, error, user, reports, readRevisions } = useStore();
  const unread = unreadReportUpdates(reports, user, readRevisions);
  const tabs: { name: string; icon: IconName; path: string }[] = [
    { name: 'Home', icon: 'grid-outline', path: '/home' },
    {
      name: user?.role === 'Collector' ? 'Tasks' : 'Reports',
      icon: 'document-text-outline',
      path: '/reports',
    },
    ...(user?.role === 'Resident'
      ? [{ name: 'Report', icon: 'add-circle' as IconName, path: '/new-report' }]
      : [{ name: 'Map', icon: 'map-outline' as IconName, path: '/map' }]),
    {
      name: user?.role === 'Admin' ? 'Users' : 'Updates',
      icon: user?.role === 'Admin' ? 'people-outline' : 'notifications-outline',
      path: user?.role === 'Admin' ? '/users' : '/notifications',
    },
    { name: 'Profile', icon: 'person-outline', path: '/profile' },
  ];
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.shell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {title && (
          <View style={s.header}>
            {back ? (
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                style={s.iconButton}
              >
                <Icon name="arrow-back" color={C.dark} />
              </Pressable>
            ) : (
              <Logo />
            )}
            {back && <Text style={[s.heading, { flex: 1, marginHorizontal: 10 }]}>{title}</Text>}
            {user ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open updates, ${unread} unread`}
                onPress={() => router.push('/notifications')}
                style={s.iconButton}
              >
                <Icon name="notifications-outline" />
                {unread > 0 && <Text style={s.unreadBadge}>{unread > 99 ? '99+' : unread}</Text>}
              </Pressable>
            ) : (
              <View style={{ width: 35 }} />
            )}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={[s.error, { marginHorizontal: 20 }]}>
            {error}
          </Text>
        )}
        {!ready ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator color={C.green} />
            <Text style={s.muted}>Loading CleanTrack...</Text>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.content, contentStyle]}
          >
            {children}
          </ScrollView>
        )}
        {tab && (
          <View style={s.tabs}>
            {tabs.map((t) => (
              <Pressable
                key={t.name}
                accessibilityLabel={t.name}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === t.name }}
                onPress={() => {
                  if (tab !== t.name) router.replace(t.path as '/home');
                }}
                style={({ pressed }) => [s.tab, pressed && { opacity: 0.7 }]}
              >
                <View style={[s.tabIcon, tab === t.name && { backgroundColor: C.pale }]}>
                  <Icon
                    name={t.icon}
                    size={t.name === 'Report' ? 34 : 22}
                    color={tab === t.name ? C.green : C.muted}
                  />
                  {t.name === 'Updates' && unread > 0 && (
                    <Text accessibilityLabel={`${unread} unread updates`} style={s.unreadBadge}>
                      {unread > 99 ? '99+' : unread}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: tab === t.name ? '700' : '400',
                    color: tab === t.name ? C.green : C.muted,
                  }}
                >
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  shell: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' },
  content: { padding: 20, gap: 22, paddingBottom: 35 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  logo: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: C.dark, fontSize: 23, fontWeight: '800', letterSpacing: -0.8 },
  eyebrow: { color: C.muted, fontSize: 8, letterSpacing: 1.7, marginTop: 3 },
  heading: { fontSize: 19, fontWeight: '700', color: C.dark },
  title: { color: C.dark, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  muted: { fontSize: 13, lineHeight: 21, color: C.muted },
  label: { fontSize: 13, fontWeight: '600', color: C.dark },
  card: {
    backgroundColor: '#fff',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  button: {
    backgroundColor: C.green,
    minHeight: 52,
    borderRadius: 13,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  secondary: { backgroundColor: C.pale, borderWidth: 1, borderColor: '#cde7d9' },
  input: {
    color: C.dark,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    fontSize: 15,
    minHeight: 50,
  },
  badge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tab: { flex: 1, gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  tabIcon: {
    width: 48,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 17,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: C.green,
    color: '#fff',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
  },
  error: {
    color: '#b54444',
    backgroundColor: '#fff0ed',
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#edf2ef',
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: C.green },
  photo: { width: '100%', height: 230, borderRadius: 18, backgroundColor: C.pale },
});
