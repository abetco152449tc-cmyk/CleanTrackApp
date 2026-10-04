export type MapCoordinate = { latitude: number; longitude: number };
export const defaultMapCenter: MapCoordinate = { latitude: 7.4478, longitude: 125.8078 };

export function parseMapCoordinate(value: unknown): MapCoordinate | undefined {
  if (!value || typeof value !== 'object') return;
  const { latitude, longitude } = value as MapCoordinate;
  if (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 85 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  )
    return { latitude, longitude };
}

// Both platforms use the same map, without a Google Maps or device-location dependency.
export function locationMapHtml(initial?: MapCoordinate): string {
  const center = parseMapCoordinate(initial) ?? defaultMapCenter;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}body{font-family:system-ui;background:#e8f5ee}
#pin{position:absolute;left:50%;top:50%;z-index:500;pointer-events:none;width:32px;height:42px;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px #555)}
#status{position:absolute;top:12px;left:55px;right:12px;z-index:600;background:white;padding:10px;border-radius:8px;font-size:13px;text-align:center}
.leaflet-control-attribution{font-size:11px}</style></head><body>
<div id="map" role="application" aria-label="Choose report location"></div><svg id="pin" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41C13 34 1 23 1 16a15 15 0 0 1 30 0c0 7-12 18-15 25Z" fill="#087f5b" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="white"/></svg><div id="status">Loading map…</div>
<script>
function send(message){var text=JSON.stringify(message);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(text);else window.parent.postMessage(text,'*');}
function failed(){document.getElementById('status').textContent='Map unavailable. Check your internet connection and reopen the map.';send({type:'error'});}
var startup=setTimeout(failed,15000);
function start(){
var map=L.map('map',{worldCopyJump:true,maxBounds:[[-85,-Infinity],[85,Infinity]]}).setView([${center.latitude},${center.longitude}],${initial ? 17 : 14});
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
var loaded=false;
function position(){var c=map.getCenter().wrap();send({type:'position',latitude:c.lat,longitude:c.lng});}
tiles.on('tileload',function(){clearTimeout(startup);if(!loaded){loaded=true;document.getElementById('status').textContent='Drag the map or tap a spot to place the pin';position();}});
tiles.on('tileerror',function(){if(!loaded)failed();});
map.on('movestart',function(){send({type:'moving'});});
map.on('moveend',function(){if(loaded)position();});
map.on('click',function(e){map.panTo(e.latlng,{animate:false});});
}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()" onerror="failed()"></script></body></html>`;
}
