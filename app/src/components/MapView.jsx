// The home map: live OpenStreetMap tiles with one mark per town. Blue dot = SFD published, orange ring = WFD published.
import { useEffect, useRef } from 'react';
import { MapLibreMap, Marker, NavigationControl } from './maplib.js';

export const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#D9E6EE' } }, { id: 'osm', type: 'raster', source: 'osm' }],
};
export const BANGLADESH = [[87.9, 20.5], [92.8, 26.7]];

export default function MapView({ towns, sfdOnly, selectedId, onPick, showBoth, showSfd }) {
  const box = useRef(null);
  const st = useRef({ map: null, pins: new Map(), sfd: [], label: null });
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const map = new MapLibreMap({ container: box.current, style: OSM_STYLE, bounds: BANGLADESH, fitBoundsOptions: { padding: 24 }, minZoom: 5, maxZoom: 18, attributionControl: { compact: false } });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    st.current.map = map;
    const max = Math.max(...towns.map((x) => x.pop));
    for (const s of sfdOnly) {
      const el = document.createElement('div');
      el.className = 'pin-sfd'; el.title = `${s[0]}: SFD published. Add a WFD to plan.`;
      st.current.sfd.push(new Marker({ element: el }).setLngLat([s[1], s[2]]).addTo(map));
    }
    for (const x of [...towns].sort((a, b) => b.pop - a.pop)) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'pin'; el.title = x.name;
      el.setAttribute('aria-label', `${x.name}, ${x.district || 'Bangladesh'}: SFD and WFD published`);
      const dot = document.createElement('span');
      const size = Math.round(13 + 15 * Math.sqrt(x.pop / max));
      dot.style.width = `${size}px`; dot.style.height = `${size}px`;
      el.appendChild(dot);
      el.addEventListener('click', (e) => { e.stopPropagation(); pick.current(x.id); });
      st.current.pins.set(String(x.id), { el, marker: new Marker({ element: el }).setLngLat(x.centre).addTo(map), town: x });
    }
    return () => { map.remove(); st.current = { map: null, pins: new Map(), sfd: [], label: null }; };
  }, [towns, sfdOnly]);

  useEffect(() => {
    const s = st.current;
    if (!s.map) return;
    for (const [id, p] of s.pins) { p.el.classList.toggle('sel', id === String(selectedId)); p.el.style.display = showBoth ? '' : 'none'; p.el.style.zIndex = id === String(selectedId) ? '3' : '1'; }
    for (const m of s.sfd) m.getElement().style.display = showSfd ? '' : 'none';
    if (s.label) { s.label.remove(); s.label = null; }
    const sel = s.pins.get(String(selectedId));
    if (sel && showBoth) {
      const el = document.createElement('div');
      el.className = 'pin-label'; el.textContent = sel.town.name;
      s.label = new Marker({ element: el, anchor: 'bottom', offset: [0, -20] }).setLngLat(sel.town.centre).addTo(s.map);
      el.style.zIndex = '5';
      if (!s.map.getBounds().contains(sel.town.centre)) s.map.easeTo({ center: sel.town.centre, duration: 600 });
    }
  }, [selectedId, showBoth, showSfd, towns]);

  return <div ref={box} className="map" role="application" aria-label="Map of Bangladesh. Each mark is a town with published reports; choose one to plan." />;
}
