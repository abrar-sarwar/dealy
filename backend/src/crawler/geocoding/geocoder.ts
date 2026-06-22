// src/crawler/geocoding/geocoder.ts
export interface GeocodeResult { latitude: number; longitude: number; confidence: number }
export interface Geocoder { geocode(address: string): Promise<GeocodeResult | null> }
export const GEOCODER = Symbol('GEOCODER');
