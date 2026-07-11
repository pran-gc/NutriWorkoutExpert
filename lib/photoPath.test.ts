import { isValidPhotoFilename, makePhotoFilename, photoUri } from '@/lib/photoPath';

describe('photoPath', () => {
  it('generates a filename matching the meal- pattern', () => {
    const name = makePhotoFilename(1720000000000, 'abc123');
    expect(name).toBe('meal-1720000000000-abc123.jpg');
    expect(isValidPhotoFilename(name)).toBe(true);
  });

  it('generated filenames are always valid', () => {
    for (let i = 0; i < 20; i++) {
      expect(isValidPhotoFilename(makePhotoFilename())).toBe(true);
    }
  });

  it('rejects paths, URLs, and junk as filenames', () => {
    expect(isValidPhotoFilename('/var/mobile/meal-1-abc.jpg')).toBe(false);
    expect(isValidPhotoFilename('https://evil.com/x.jpg')).toBe(false);
    expect(isValidPhotoFilename('photo.png')).toBe(false);
    expect(isValidPhotoFilename('')).toBe(false);
  });

  it('builds a full URI from dir + filename', () => {
    expect(photoUri('file:///docs/photos/', 'meal-1-a.jpg')).toBe('file:///docs/photos/meal-1-a.jpg');
  });
});
