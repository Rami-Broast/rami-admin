import React, { useCallback, useEffect, useRef } from 'react';
import { APIProvider, Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

import { GOOGLE_MAPS_API_KEY } from '../api/config';

export interface LocationData {
  addressLine: string;
  district: string;
  city: string;
  latitude: string;
  longitude: string;
}

interface Props {
  value: LocationData;
  onChange: (patch: Partial<LocationData>) => void;
}

const SA_CENTER = { lat: 23.8859, lng: 45.0792 };

function extractFromComponents(
  comps: google.maps.GeocoderAddressComponent[],
  formatted?: string,
): Partial<LocationData> {
  const r: Partial<LocationData> = {};
  let route = '';
  let streetNumber = '';

  for (const c of comps) {
    if (c.types.includes('street_number')) streetNumber = c.long_name;
    if (c.types.includes('route')) route = c.long_name;
    if (c.types.includes('sublocality_level_1') || c.types.includes('neighborhood'))
      r.district = c.long_name;
    if (c.types.includes('locality') || c.types.includes('administrative_area_level_2'))
      r.city = c.long_name;
  }

  if (route) {
    r.addressLine = streetNumber ? `${streetNumber} ${route}` : route;
  } else if (formatted) {
    r.addressLine = formatted.split(',')[0] ?? '';
  }
  return r;
}

function PlacesSearch({ onSelect }: { onSelect: (place: google.maps.places.PlaceResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  const initRef = useRef(false);

  useEffect(() => {
    if (!places || !inputRef.current || initRef.current) return;
    initRef.current = true;

    const ac = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'sa' },
      fields: ['formatted_address', 'geometry', 'address_components', 'name'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place?.geometry?.location) onSelect(place);
    });
  }, [places, onSelect]);

  return (
    <input
      ref={inputRef}
      placeholder="Search for a location in Saudi Arabia..."
      style={{ width: '100%' }}
    />
  );
}

function MapWithPin({
  lat,
  lng,
  onLocationChange,
}: {
  lat: number | null;
  lng: number | null;
  onLocationChange: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const position = lat != null && lng != null && !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;

  useEffect(() => {
    if (map && position) map.panTo(position);
  }, [map, position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Map
      defaultCenter={position ?? SA_CENTER}
      defaultZoom={position ? 16 : 6}
      gestureHandling="greedy"
      disableDefaultUI={false}
      onClick={(e) => {
        const ll = e.detail?.latLng;
        if (ll) onLocationChange(ll.lat, ll.lng);
      }}
      style={{ width: '100%', height: 300 }}
    >
      {position && (
        <Marker
          position={position}
          draggable
          onDragEnd={(e: google.maps.MapMouseEvent) => {
            if (e.latLng) onLocationChange(e.latLng.lat(), e.latLng.lng());
          }}
        />
      )}
    </Map>
  );
}

function PickerInner({ value, onChange }: Props) {
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (!geocoderRef.current) {
        try {
          geocoderRef.current = new google.maps.Geocoder();
        } catch {
          return;
        }
      }
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const extracted = extractFromComponents(
            results[0].address_components,
            results[0].formatted_address,
          );
          onChange({ ...extracted, latitude: String(lat), longitude: String(lng) });
        }
      });
    },
    [onChange],
  );

  const handlePlaceSelect = useCallback(
    (place: google.maps.places.PlaceResult) => {
      const extracted = extractFromComponents(
        place.address_components ?? [],
        place.formatted_address,
      );
      if (place.geometry?.location) {
        extracted.latitude = String(place.geometry.location.lat());
        extracted.longitude = String(place.geometry.location.lng());
      }
      onChange(extracted);
    },
    [onChange],
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      onChange({ latitude: String(lat), longitude: String(lng) });
      reverseGeocode(lat, lng);
    },
    [onChange, reverseGeocode],
  );

  const lat = value.latitude ? parseFloat(value.latitude) : null;
  const lng = value.longitude ? parseFloat(value.longitude) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>
        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          Search location
        </span>
        <PlacesSearch onSelect={handlePlaceSelect} />
      </label>

      <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <MapWithPin lat={lat} lng={lng} onLocationChange={handleMapClick} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Click on the map or drag the pin to set the exact location.
      </p>

      <AddressFields value={value} onChange={onChange} />
    </div>
  );
}

function AddressFields({ value, onChange }: Props) {
  return (
    <>
      <label>
        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          Street address *
        </span>
        <input
          value={value.addressLine}
          onChange={(e) => onChange({ addressLine: e.target.value })}
          placeholder="King Fahd Rd, Building 14"
          maxLength={250}
        />
      </label>
      <label>
        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          District / neighbourhood
        </span>
        <input
          value={value.district}
          onChange={(e) => onChange({ district: e.target.value })}
          placeholder="Al Olaya"
          maxLength={120}
        />
      </label>
      <label>
        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>City *</span>
        <input
          value={value.city}
          onChange={(e) => onChange({ city: e.target.value })}
          placeholder="Riyadh"
          maxLength={80}
        />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Latitude</span>
          <input
            type="number"
            value={value.latitude}
            onChange={(e) => onChange({ latitude: e.target.value })}
            placeholder="24.7136"
            step="any"
          />
        </label>
        <label style={{ flex: 1 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Longitude</span>
          <input
            type="number"
            value={value.longitude}
            onChange={(e) => onChange({ longitude: e.target.value })}
            placeholder="46.6753"
            step="any"
          />
        </label>
      </div>
    </>
  );
}

export function LocationPicker({ value, onChange }: Props): React.JSX.Element {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AddressFields value={value} onChange={onChange} />
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable map pin selection and address search.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <PickerInner value={value} onChange={onChange} />
    </APIProvider>
  );
}
