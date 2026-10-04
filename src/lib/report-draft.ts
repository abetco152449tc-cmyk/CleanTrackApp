import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { firebaseConfigured } from './firebase';

export type ReportDraft = {
  photo: string;
  type: string;
  title: string;
  description: string;
  address: string;
  coords?: { latitude: number; longitude: number };
  accuracy: number | null;
  locationSource?: 'gps' | 'map' | 'address';
  step: number;
  reportId: string;
};

export const reportDraftKey = (uid: string) =>
  `cleantrack:report-draft:${firebaseConfigured ? 'firebase' : 'demo'}:${uid}`;

export async function loadReportDraft(uid: string): Promise<ReportDraft | null> {
  const saved = await AsyncStorage.getItem(reportDraftKey(uid));
  if (!saved) return null;
  const draft = JSON.parse(saved) as ReportDraft;
  if (
    !draft ||
    !['photo', 'type', 'title', 'description', 'address', 'reportId'].every(
      (field) => typeof draft[field as keyof ReportDraft] === 'string',
    ) ||
    !Number.isInteger(draft.step) ||
    draft.step < 1 ||
    draft.step > 4 ||
    !(draft.accuracy === null || Number.isFinite(draft.accuracy)) ||
    (draft.coords &&
      (!Number.isFinite(draft.coords.latitude) ||
        Math.abs(draft.coords.latitude) > 90 ||
        !Number.isFinite(draft.coords.longitude) ||
        Math.abs(draft.coords.longitude) > 180))
  )
    throw Error('Saved draft could not be read. Discard it to start a new report.');
  if (
    Platform.OS !== 'web' &&
    draft.photo &&
    !draft.photo.startsWith('data:') &&
    !new File(draft.photo).exists
  )
    return { ...draft, photo: '', step: 1 };
  return draft;
}

export async function saveReportDraft(uid: string, draft: ReportDraft): Promise<ReportDraft> {
  let photo = draft.photo;
  // Native picker files may be temporary. Keep a durable copy for returning later.
  if (
    photo &&
    Platform.OS !== 'web' &&
    !photo.startsWith('data:') &&
    !photo.startsWith(Paths.document.uri)
  ) {
    const target = new File(
      Paths.document,
      `draft-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    );
    new File(photo).copy(target);
    photo = target.uri;
  }
  const saved = { ...draft, photo };
  await AsyncStorage.setItem(reportDraftKey(uid), JSON.stringify(saved));
  return saved;
}

export async function clearReportDraft(uid: string) {
  await AsyncStorage.removeItem(reportDraftKey(uid));
}
