import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, C, Field, Icon, Page, s } from '@/components/clean-ui';
import { useStore } from '@/lib/store';
import { compressReportPhoto } from '@/lib/report-photo';
import { cloudErrorMessage } from '@/lib/cloud-errors';
import { getReportAddress, getReportLocation, ReportLocationError } from '@/lib/report-location';
import LocationPicker from '@/components/location-picker';
import ReportLocation from '@/components/report-location';
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/report-draft';
export default function NewReport() {
  const { user, addReport } = useStore();
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState('');
  const [type, setType] = useState('General Waste');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>();
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'map' | 'address'>('address');
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationSettings, setLocationSettings] = useState<'permission' | 'location' | null>(null);
  const submitted = useRef(false);
  const screenEpoch = useRef(0);
  const [completedId, setCompletedId] = useState('');
  const reportId = useRef('');
  const [draftReady, setDraftReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftFailure, setDraftFailure] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const uid = user?.id;
  useFocusEffect(
    useCallback(() => {
      screenEpoch.current += 1;
      return () => {
        screenEpoch.current += 1;
      };
    }, []),
  );
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void loadReportDraft(uid)
      .then((draft) => {
        if (!active) return;
        if (draft) {
          setPhoto(draft.photo);
          setType(draft.type);
          setTitle(draft.title);
          setDescription(draft.description);
          setAddress(draft.address);
          setCoords(draft.coords);
          setAccuracy(draft.accuracy);
          setLocationSource(
            draft.locationSource ??
              (draft.coords ? (draft.accuracy === null ? 'map' : 'gps') : 'address'),
          );
          setStep(draft.step);
          reportId.current = draft.reportId;
          setDraftMessage('Your saved draft is restored. Review it before submitting.');
        }
        setDraftReady(true);
      })
      .catch(() => {
        if (active) {
          setDraftFailure(true);
          setError(
            'Your saved draft could not be loaded. Reopen this screen to retry, or discard the saved draft to start again.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [uid]);
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'Resident') return <Redirect href="/home" />;
  async function persistDraft() {
    const saved = await saveReportDraft(user!.id, {
      photo,
      type,
      title,
      description,
      address,
      coords,
      accuracy,
      locationSource,
      step,
      reportId: reportId.current,
    });
    setPhoto(saved.photo);
    return saved;
  }
  async function saveDraft() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await persistDraft();
      setDraftMessage(
        'Draft saved on this device. You can leave and return later. It has not been submitted.',
      );
    } catch {
      setError(
        'Could not save the draft on this device. Your details are still here; try saving again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function pick(camera: boolean) {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (camera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted)
          throw Error('Camera access was denied. Choose a photo from your library instead.');
      }
      const result = await (camera
        ? ImagePicker.launchCameraAsync({ quality: 0.7 })
        : ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          }));
      if (!result.canceled) {
        const asset = result.assets[0];
        setPhoto(await compressReportPhoto(asset.uri, asset.width, asset.height));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open photos.');
    } finally {
      setBusy(false);
    }
  }
  async function locate() {
    if (busy) return;
    setBusy(true);
    setError('');
    setLocationSettings(null);
    try {
      const loc = await getReportLocation();
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setAccuracy(loc.coords.accuracy);
      setLocationSource('gps');
      setAddress(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
      setAddress(await getReportAddress(loc.coords));
    } catch (e) {
      setLocationSettings(e instanceof ReportLocationError ? e.settings : null);
      setError(
        e instanceof Error ? e.message : 'Unable to get location. Enter an address manually.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (submitted.current) return;
    setError('');
    if (!photo || !title.trim() || !description.trim() || !address.trim()) {
      setError('Add a photo, title, description and address before submitting.');
      return;
    }
    submitted.current = true;
    const epoch = screenEpoch.current;
    setBusy(true);
    setSaving(true);
    try {
      if (!reportId.current)
        reportId.current = `CT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 10)}`;
      const draft = await persistDraft();
      const id = reportId.current;
      const created = new Date().toISOString();
      submitted.current = true;
      await addReport({
        id,
        title: title.trim(),
        type,
        description: description.trim(),
        address: address.trim(),
        photo: draft.photo,
        ...coords,
        locationSource: coords ? locationSource : 'address',
        ...(coords && accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0
          ? { locationAccuracy: accuracy }
          : {}),
        resident: user!.id,
        status: 'Submitted',
        created,
        history: [
          {
            status: 'Submitted',
            date: created,
            note: 'Report received. Waiting for barangay review.',
          },
        ],
      });
      setCompletedId(id);
      setDraftMessage('Your report was submitted. You can view it or find it in Reports.');
      // A cleanup failure must not turn a successful submission into a failed one.
      await clearReportDraft(user!.id).catch(() => {});
      if (epoch !== screenEpoch.current) return;
      router.replace({ pathname: '/success', params: { id, kind: 'report' } });
    } catch (e) {
      submitted.current = false;
      setSubmitFailed(true);
      setError(
        `${cloudErrorMessage(e)} Your photo and details are still here. Try submitting again when ready.`,
      );
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }
  if (!draftReady)
    return (
      <Page title="Report garbage" back>
        <Text style={s.muted}>{draftFailure ? error : 'Checking for a saved draft...'}</Text>
        {draftFailure && (
          <Button
            title="Discard saved draft"
            secondary
            onPress={() => {
              void clearReportDraft(user.id)
                .then(() => {
                  setDraftReady(true);
                  setDraftFailure(false);
                  setError('');
                })
                .catch(() => setError('Could not discard the draft. Reopen this screen to retry.'));
            }}
          />
        )}
      </Page>
    );
  return (
    <Page title="Report garbage" back>
      <Text style={s.title}>
        {step === 1
          ? 'A photo tells the story.'
          : step === 2
            ? 'Tell us a little more.'
            : step === 3
              ? 'Where is the waste?'
              : 'Review your report.'}
      </Text>
      <Text style={[s.muted, { marginTop: -13 }]}>
        STEP {step} OF 4 -{' '}
        {step === 1
          ? 'Capture the problem'
          : step === 2
            ? 'Add report details'
            : step === 3
              ? 'Confirm the location'
              : 'Check and submit'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {[1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={{
              height: 5,
              flex: 1,
              borderRadius: 3,
              backgroundColor: n <= step ? C.green : C.border,
            }}
          />
        ))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!draftMessage && (
        <Text accessibilityRole="alert" style={s.muted}>
          {draftMessage}
        </Text>
      )}
      {step === 3 && locationSettings && Platform.OS !== 'web' && (
        <Button
          title={
            locationSettings === 'location' ? 'Open location settings' : 'Open app permissions'
          }
          secondary
          onPress={() => {
            const open =
              Platform.OS === 'android' && locationSettings === 'location'
                ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS')
                : Linking.openSettings();
            void open.catch(() =>
              setError(
                'Open your phone Settings manually, enable Location and allow location access for CleanTrack (or Expo Go), then return and try again.',
              ),
            );
          }}
        />
      )}
      {step === 1 ? (
        <>
          {photo ? (
            <Image source={{ uri: photo }} style={s.photo} />
          ) : (
            <View
              style={[
                s.card,
                {
                  height: 235,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderStyle: 'dashed',
                  backgroundColor: C.pale,
                },
              ]}
            >
              <Icon name="camera-outline" size={55} />
              <Text style={s.heading}>Make the problem visible</Text>
              <Text style={s.muted}>Take a clear photo of the waste.</Text>
            </View>
          )}
          <Button
            title={busy ? 'Preparing photo...' : 'Take a photo'}
            onPress={() => void pick(true)}
            disabled={busy}
          />
          <Button
            title="Choose from gallery"
            secondary
            onPress={() => void pick(false)}
            disabled={busy}
          />
          <Button title="Continue" disabled={!photo || busy} onPress={() => setStep(2)} />
        </>
      ) : step === 2 ? (
        <>
          <Text style={s.heading}>Type of garbage</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {['General Waste', 'Recyclables', 'Illegal Dumping', 'Others'].map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityLabel={t}
                accessibilityState={{ checked: type === t, disabled: busy }}
                disabled={busy}
                onPress={() => setType(t)}
                style={[
                  s.card,
                  {
                    flexBasis: '45%',
                    flexGrow: 1,
                    alignItems: 'center',
                    backgroundColor: type === t ? C.pale : 'white',
                    borderColor: type === t ? C.green : C.border,
                  },
                ]}
              >
                <Icon
                  name={
                    t === 'Recyclables'
                      ? 'leaf-outline'
                      : t === 'Illegal Dumping'
                        ? 'warning-outline'
                        : 'trash-outline'
                  }
                />
                <Text style={s.label}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Report title"
            placeholder="e.g. Overflowing bin near the market"
            maxLength={80}
            value={title}
            onChangeText={setTitle}
          />
          <Field
            label="Description"
            placeholder="What happened? Include a nearby landmark."
            multiline
            maxLength={500}
            value={description}
            onChangeText={setDescription}
          />
          <Text style={s.muted}>{description.length}/500</Text>
          <Button
            title="Continue"
            onPress={() => {
              setStep(3);
            }}
            disabled={!title.trim() || !description.trim()}
          />
          <Button title="Back" secondary onPress={() => setStep(1)} />
        </>
      ) : step === 3 ? (
        <>
          <View style={[s.card, { backgroundColor: C.pale, alignItems: 'center', padding: 30 }]}>
            <Icon name="location" size={55} />
            <Text style={s.heading}>
              {coords ? 'Report location selected' : 'Pinpoint the problem'}
            </Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>
              {coords
                ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                : 'Choose the spot on a map. No GPS or location permission needed.'}
            </Text>
            {coords && accuracy !== null && (
              <Text style={[s.muted, { textAlign: 'center' }]}>
                Estimated accuracy: {Math.round(accuracy)} m.
                {accuracy > 100
                  ? ' This location is approximate. Try again outdoors for a better fix.'
                  : ''}
              </Text>
            )}
          </View>
          <Button
            title={coords ? 'Adjust pin on map' : 'Choose on map'}
            disabled={busy}
            onPress={() => setChoosingLocation(true)}
          />
          {choosingLocation && (
            <LocationPicker
              initial={coords}
              onClose={() => setChoosingLocation(false)}
              onConfirm={(selected) => {
                const previousCoordinates =
                  coords && `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
                if (!address.trim() || address === previousCoordinates)
                  setAddress(`${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`);
                setCoords(selected);
                setAccuracy(null);
                setLocationSource('map');
                setError('');
                setLocationSettings(null);
                setChoosingLocation(false);
              }}
            />
          )}
          <Button
            title={busy ? 'Finding your location...' : 'Use current location'}
            secondary
            onPress={() => void locate()}
            disabled={busy}
          />
          <Field
            label="Address or landmark"
            maxLength={500}
            editable={!busy}
            value={address}
            onChangeText={(v) => {
              setAddress(v);
            }}
            placeholder="Street, purok, barangay and city"
            multiline
          />
          <Text style={s.muted}>
            {coords
              ? 'Your map pin is saved with the report. Add a landmark to help the collector find it.'
              : 'Choose a map pin or enter an address. The map needs internet; current location is optional.'}
          </Text>
          {coords && (
            <Button
              title="Remove pin"
              secondary
              disabled={busy}
              onPress={() => {
                if (address === `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`)
                  setAddress('');
                setCoords(undefined);
                setLocationSource('address');
                setAccuracy(null);
              }}
            />
          )}
          <Button
            title="Review report"
            onPress={() => {
              setError('');
              setStep(4);
            }}
            disabled={busy || !address.trim()}
          />
          <Button title="Back" disabled={busy} secondary onPress={() => setStep(2)} />
        </>
      ) : (
        <>
          <Image
            source={{ uri: photo }}
            accessibilityLabel="Report photo preview"
            style={s.photo}
          />
          <View style={s.card}>
            <Text style={s.heading}>{title}</Text>
            <Text style={s.label}>{type}</Text>
            <Text style={s.muted}>{description}</Text>
          </View>
          <ReportLocation
            report={{
              address,
              ...coords,
              locationSource,
              ...(coords && accuracy !== null ? { locationAccuracy: accuracy } : {}),
            }}
          />
          <Text style={s.muted}>
            Check the photo, details and location. Submitting sends this report to the barangay for
            review.
          </Text>
          <Button
            title={
              completedId
                ? 'View submitted report'
                : saving
                  ? 'Submitting report...'
                  : submitFailed
                    ? 'Retry submission'
                    : 'Submit report'
            }
            disabled={busy}
            loading={saving}
            onPress={() =>
              completedId
                ? router.replace({
                    pathname: '/success',
                    params: { id: completedId, kind: 'report' },
                  })
                : void submit()
            }
          />
          <Button
            title="Edit photo"
            secondary
            disabled={busy || !!completedId}
            onPress={() => setStep(1)}
          />
          <Button
            title="Edit details"
            secondary
            disabled={busy || !!completedId}
            onPress={() => setStep(2)}
          />
          <Button
            title="Edit location"
            secondary
            disabled={busy || !!completedId}
            onPress={() => setStep(3)}
          />
        </>
      )}
      <Button
        title="Save draft"
        secondary
        disabled={busy || !!completedId}
        onPress={() => void saveDraft()}
      />
      <Text style={s.muted}>
        Save your draft before leaving. One draft per account is kept on this device.
      </Text>
    </Page>
  );
}
