// The town's own map in step 3: live OpenStreetMap, zoomed to the town so streets and buildings show.
// The town's outline is looked up once from OpenStreetMap's place search; the stored approximate centre is the fallback.
import { useEffect, useRef, useState } from 'react';
import { MapLibreMap, Marker, NavigationControl } from './maplib.js';
import { OSM_STYLE, BANGLADESH } from './MapView.jsx';

const SITES = [['plant', 'treatment plant', 'P'], ['disposal', 'disposal site', 'D']];
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.57);

async function lookup(name, district, country) {
  const key = `place:${name}|${district || ''}|${country || ''}`;
  try { const hit = sessionStorage.getItem(key); if (hit) return JSON.parse(hit); } catch { /* no storage */ }
  const q = [name, district, country].filter(Boolean).join(', ');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const [hit] = await res.json();
  if (!hit) return null;
  const b = hit.boundingbox.map(Number); // south, north, west, east
  const out = { centre: [Number(hit.lon), Number(hit.lat)], bounds: [[b[2], b[0]], [b[3], b[1]]] };
  try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* not kept */ }
  return out;
}

export default function TownMap({ name, district, country, place, sites, onSite }) {
  const box = useRef(null);
  const st = useRef({ map: null, markers: {} });
  const [placing, setPlacing] = useState(null);
  const placingRef = useRef(null); placingRef.current = placing;
  const onSiteRef = useRef(onSite); onSiteRef.current = onSite;
  const [found, setFound] = useState(place ? 'approx' : 'none');

  useEffect(() => {
    const opts = place ? { center: place.centre, zoom: 12.5 } : { bounds: country && country !== 'Bangladesh' ? [[-170, -55], [180, 72]] : BANGLADESH };
    const map = new MapLibreMap({ container: box.current, style: OSM_STYLE, ...opts, maxZoom: 19, attributionControl: { compact: false } });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => { const k = placingRef.current; if (k) { onSiteRef.current(k, [e.lngLat.lng, e.lngLat.lat]); setPlacing(null); } });
    st.current.map = map;
    let live = true;
    lookup(name, district, country === 'other' ? '' : country || 'Bangladesh').then((hit) => {
      if (!live || !hit) return;
      // A match far from the known sub-district is another place of the same name: keep the stored position.
      if (place && km(hit.centre, place.centre) > 30) return;
      map.fitBounds(hit.bounds, { padding: 24, maxZoom: 15, duration: 0 });
      setFound('osm');
    }).catch(() => {});
    return () => { live = false; map.remove(); st.current = { map: null, markers: {} }; };
  }, [name, district, country, place]);

  useEffect(() => {
    const s = st.current;
    if (!s.map) return;
    for (const [k, , letter] of SITES) {
      if (s.markers[k]) { s.markers[k].remove(); delete s.markers[k]; }
      if (!sites[k]) continue;
      // MapLibre positions the outer element with a transform, so the pin's own shape sits on an inner element.
      const el = document.createElement('div');
      el.title = k === 'plant' ? 'Treatment plant site' : 'Disposal site';
      const pin = document.createElement('div');
      pin.className = `site-pin ${k}`;
      const b = document.createElement('b'); b.textContent = letter; pin.appendChild(b);
      el.appendChild(pin);
      const m = new Marker({ element: el, draggable: true, anchor: 'bottom', offset: [0, -6] }).setLngLat(sites[k]).addTo(s.map);
      m.on('dragend', () => { const p = m.getLngLat(); onSiteRef.current(k, [p.lng, p.lat]); });
      s.markers[k] = m;
    }
  }, [sites]);
  useEffect(() => { if (st.current.map) st.current.map.getCanvas().style.cursor = placing ? 'crosshair' : ''; }, [placing]);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div ref={box} className="map town" role="application" aria-label={`Map of ${name}. Zoom in for streets and buildings.`} />
      <div className="row">
        {SITES.map(([k, label]) => (
          <span key={k} className="row" style={{ gap: 6 }}>
            <button type="button" className={`btn small${placing === k ? ' primary' : ''}`} aria-pressed={placing === k} onClick={() => setPlacing(placing === k ? null : k)}>
              {placing === k ? `Click the map: ${label}` : sites[k] ? `Move the ${label}` : `Mark the ${label}`}
            </button>
            {sites[k] && <button type="button" className="btn small" onClick={() => onSite(k, null)} aria-label={`Remove the ${label} mark`}>Remove</button>}
          </span>
        ))}
      </div>
      <p className="small muted">
        {found === 'osm' ? 'Zoom in to see streets, buildings and water bodies.' : found === 'approx' ? 'Opened near the town, at the centre of its sub-district. Zoom in to see streets, buildings and water bodies.' : 'Zoom to your town to see its streets and buildings.'}
        {' '}Marks are saved in the workbook and named in the plan document. You can drag them.
      </p>
    </div>
  );
}
