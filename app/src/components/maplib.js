// MapLibre GL, set up once: the worker file is served from this site (the page allows no other script origin).
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

export { MapLibreMap, Marker, NavigationControl };
