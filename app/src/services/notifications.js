import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 알림 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 알림 권한 요청
 */
export const requestNotificationPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      return finalStatus === 'granted';
    } else {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    }
  } catch (error) {
    console.error('[Notifications] Error requesting permission:', error);
    return false;
  }
};

/**
 * 로컬 알림 발송
 */
export const sendLocalNotification = async (title, body, data = {}) => {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('[Notifications] Permission not granted, cannot send notification');
      return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // 즉시 발송
    });

    console.log('[Notifications] Notification sent:', title);
    return true;
  } catch (error) {
    console.error('[Notifications] Error sending notification:', error);
    return false;
  }
};

/**
 * 음악 인식 결과 알림 발송
 */
export const sendRecognitionNotification = async (title, artist, data = {}) => {
  const notificationTitle = '🎵 음악 인식 완료';
  const notificationBody = artist 
    ? `${title} - ${artist}`
    : title;
  
  return await sendLocalNotification(notificationTitle, notificationBody, {
    type: 'recognition',
    title,
    artist,
    ...data,
  });
};

/**
 * 음악 인식 실패 알림 발송
 */
export const sendRecognitionFailedNotification = async (message) => {
  const notificationTitle = '❌ 음악 인식 실패';
  const notificationBody = message || '음악을 찾을 수 없습니다.';
  
  return await sendLocalNotification(notificationTitle, notificationBody, {
    type: 'recognition_failed',
  });
};

/**
 * 알림 리스너 설정
 */
export const setupNotificationListeners = (onNotificationReceived, onNotificationTapped) => {
  // 포그라운드 알림 수신
  const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
    console.log('[Notifications] Notification received:', notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // 알림 탭 (앱이 포그라운드/백그라운드일 때)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('[Notifications] Notification tapped:', response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  return {
    remove: () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    },
  };
};

/**
 * 모든 알림 취소
 */
export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] All notifications cancelled');
  } catch (error) {
    console.error('[Notifications] Error cancelling notifications:', error);
  }
};
