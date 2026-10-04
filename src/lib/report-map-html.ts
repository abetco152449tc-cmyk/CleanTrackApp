import type { Report } from './store-context';

export function reportMapHtml(reports: Report[], preview = false) {
  // Render untrusted titles/addresses as text, never as HTML.
  const data = JSON.stringify(
    reports.map(({ id, title, address, latitude, longitude, locationAccuracy }) => ({
      id,
      title,
      address,
      latitude,
      longitude,
      locationAccuracy,
    })),
  ).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}body{font-family:system-ui;background:#e8f5ee}#status{position:absolute;top:12px;left:55px;right:12px;z-index:600;background:white;padding:8px;border-radius:8px;font-size:13px}button{padding:10px;color:#087f5b;background:#e8f5ee;border:0;border-radius:6px}</style></head><body>
<div id="map" role="application" aria-label="Saved report locations"></div><div id="status">Loading saved locations...</div>
<script>
function send(m){var t=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(t);else window.parent.postMessage(t,'*');}
function failed(){document.getElementById('status').textContent='Map unavailable. Your address and coordinates are still saved.';send({type:'error'});}
var timer=setTimeout(failed,15000);
function start(){
var pins=${data};var map=L.map('map');var bounds=[];
pins.forEach(function(p){var position=[p.latitude,p.longitude];bounds.push(position);
var content=document.createElement('div');var title=document.createElement('strong');title.textContent=p.title;content.appendChild(title);
var address=document.createElement('p');address.textContent=p.address;content.appendChild(address);
if(!${preview}){var button=document.createElement('button');button.textContent='Open report';button.onclick=function(){send({type:'report',id:p.id});};content.appendChild(button);}
L.marker(position).addTo(map).bindPopup(content);
if(typeof p.locationAccuracy==='number' && p.locationAccuracy>0)L.circle(position,{radius:p.locationAccuracy,color:'#087f5b',weight:1,fillOpacity:0.12}).addTo(map);
});
if(bounds.length===1)map.setView(bounds[0],17);else if(bounds.length)map.fitBounds(bounds,{padding:[30,30],maxZoom:17});else map.setView([7.4478,125.8078],14);
var loaded=false;var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
tiles.on('tileload',function(){clearTimeout(timer);if(!loaded){loaded=true;document.getElementById('status').style.display='none';send({type:'ready'});}});
tiles.on('tileerror',function(){if(!loaded)failed();});
}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()" onerror="failed()"></script></body></html>`;
}
