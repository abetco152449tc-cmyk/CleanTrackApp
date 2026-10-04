import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useStore } from '@/lib/store';
import { pushDeviceEnabled, registerPushDevice } from '@/lib/push-notifications';
import { firebaseConfigured } from '@/lib/firebase';

export default function PushListener() {
  const { user } = useStore();
  const handled = useRef('');
  const uid = user?.id;
  useEffect(() => {
    if (!uid || !firebaseConfigured || Constants.executionEnvironment === 'storeClient') return;
    let active = true;
    let stop = () => {};
    void import('expo-notifications')
      .then(async (notifications) => {
        if (!active) return;
        notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const receive = (response: import('expo-notifications').NotificationResponse) => {
          if (!active || handled.current === response.notification.request.identifier) return;
          const data = response.notification.request.content.data ?? {};
          const id = data.reportId;
          if (data.recipientId !== uid) return;
          if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return;
          handled.current = response.notification.request.identifier;
          // The detail screen fetches the report under the signed-in account's rules.
          router.push({ pathname: '/report/[id]', params: { id } });
          void notifications.clearLastNotificationResponseAsync().catch(() => {});
        };
        const responseSubscription = notifications.addNotificationResponseReceivedListener(receive);
        const tokenSubscription = notifications.addPushTokenListener(() => {
          void pushDeviceEnabled(uid)
            .then((enabled) => {
              if (active && enabled) return registerPushDevice(uid);
            })
            .catch(() => {});
        });
        stop = () => {
          responseSubscription.remove();
          tokenSubscription.remove();
        };
        const response = await notifications.getLastNotificationResponseAsync();
        if (response) receive(response);
      })
      .catch(() => {});
    return () => {
      active = false;
      stop();
    };
  }, [uid]);
  return null;
}
