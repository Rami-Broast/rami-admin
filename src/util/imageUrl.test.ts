import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/config', () => ({ API_BASE_URL: 'https://api.example.test/api/v1' }));

const { resolveImageUrl } = await import('./imageUrl');

describe('resolveImageUrl', () => {
  it('resolves an uploaded asset path against the API base', () => {
    // The backend returns a path, not a hostname, so the same stored row works
    // from the admin panel, the customer app and a local dev build.
    expect(resolveImageUrl('/assets/abc')).toBe('https://api.example.test/api/v1/assets/abc');
  });

  it('leaves an absolute URL alone', () => {
    // Everything stored before uploading existed is a URL an owner pasted.
    // Prefixing it with our API base would break every one of them.
    expect(resolveImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(resolveImageUrl('//cdn.example.com/a.jpg')).toBe('//cdn.example.com/a.jpg');
    expect(resolveImageUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('returns null for nothing, so a caller renders a placeholder', () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl(undefined)).toBeNull();
    expect(resolveImageUrl('   ')).toBeNull();
  });
});
