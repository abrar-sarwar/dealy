// src/discovery/deal-image.spec.ts
import { validImageUrl } from './deal-image';

describe('validImageUrl', () => {
  it('returns a valid https jpg url as-is', () => {
    const url = 'https://cdn.example.com/images/hero-burger.jpg';
    expect(validImageUrl(url)).toBe(url);
  });

  it('returns a valid https png ogimage url as-is', () => {
    const url = 'https://cdn.example.com/og-image.png';
    expect(validImageUrl(url)).toBe(url);
  });

  it('trims whitespace from a valid url', () => {
    const url = '  https://cdn.example.com/og.jpg  ';
    expect(validImageUrl(url)).toBe(url.trim());
  });

  it('returns null for http (non-https) url', () => {
    expect(validImageUrl('http://cdn.example.com/og.jpg')).toBeNull();
  });

  it('returns null for a .svg url', () => {
    expect(validImageUrl('https://cdn.example.com/logo.svg')).toBeNull();
  });

  it('returns null for a url path containing "tracking"', () => {
    expect(validImageUrl('https://cdn.example.com/tracking/pixel.png')).toBeNull();
  });

  it('returns null for a url path containing "favicon"', () => {
    expect(validImageUrl('https://cdn.example.com/favicon.ico')).toBeNull();
  });

  it('returns null for a url path containing "sprite"', () => {
    expect(validImageUrl('https://cdn.example.com/sprite-sheet.png')).toBeNull();
  });

  it('returns null for a url path containing "pixel"', () => {
    expect(validImageUrl('https://cdn.example.com/analytics/pixel.gif')).toBeNull();
  });

  it('returns null for a url path containing "1x1"', () => {
    expect(validImageUrl('https://cdn.example.com/1x1.gif')).toBeNull();
  });

  it('returns null for a url path containing "spacer"', () => {
    expect(validImageUrl('https://cdn.example.com/spacer.gif')).toBeNull();
  });

  it('returns null for a url path containing "logo"', () => {
    expect(validImageUrl('https://cdn.example.com/company-logo.png')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(validImageUrl(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(validImageUrl(null)).toBeNull();
  });

  it('returns null for a non-string number', () => {
    expect(validImageUrl(42)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(validImageUrl('')).toBeNull();
  });

  it('returns null for a relative url', () => {
    expect(validImageUrl('/images/hero.jpg')).toBeNull();
  });
});
