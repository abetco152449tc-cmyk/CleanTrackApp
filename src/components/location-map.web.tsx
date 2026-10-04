import { useEffect, useMemo, useRef } from 'react';
import { locationMapHtml, type MapCoordinate } from '@/lib/location-map-html';

export default function LocationMap({
  initial,
  onMessage,
  html: customHtml,
}: {
  initial?: MapCoordinate;
  onMessage: (message: string) => void;
  html?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => customHtml ?? locationMapHtml(initial), [initial, customHtml]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && typeof event.data === 'string')
        onMessage(event.data);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMessage]);
  return (
    <iframe
      ref={frame}
      title={customHtml ? 'Saved report locations' : 'Choose report location'}
      srcDoc={html}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{ border: 0, width: '100%', height: '100%', flex: 1 }}
    />
  );
}
