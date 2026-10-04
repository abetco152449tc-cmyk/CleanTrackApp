import { useMemo } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { locationMapHtml, type MapCoordinate } from '@/lib/location-map-html';

export type LocationMapProps = {
  initial?: MapCoordinate;
  onMessage: (message: string) => void;
  html?: string;
};

export default function LocationMap({ initial, onMessage, html }: LocationMapProps) {
  const source = useMemo(
    () => ({
      html: html ?? locationMapHtml(initial),
      baseUrl: 'https://cleantrack-e62a9.web.app/',
    }),
    [initial, html],
  );
  return (
    <WebView
      source={source}
      style={{ flex: 1 }}
      originWhitelist={['*']}
      applicationNameForUserAgent="CleanTrack/1.0"
      geolocationEnabled={false}
      onMessage={(event) => onMessage(event.nativeEvent.data)}
      onError={() => onMessage('{"type":"error"}')}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.url === source.baseUrl) return true;
        if (request.url === 'https://www.openstreetmap.org/copyright')
          void Linking.openURL(request.url);
        return false;
      }}
    />
  );
}
