jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

import {
  addToProgressManifest,
  parseProgressManifest,
  removeFromProgressManifest,
  type ProgressPhoto,
} from './photos';

describe('progress photo manifest helpers', () => {
  const first: ProgressPhoto = { filename: 'first.jpg', logged_on: '2026-07-10' };
  const second: ProgressPhoto = { filename: 'second.jpg', logged_on: '2026-07-11' };

  it('parses missing, invalid, and valid manifests', () => {
    expect(parseProgressManifest(null)).toEqual([]);
    expect(parseProgressManifest('not json')).toEqual([]);
    expect(parseProgressManifest(JSON.stringify([first]))).toEqual([first]);
  });

  it('adds newest progress photos first', () => {
    expect(addToProgressManifest([first], second)).toEqual([second, first]);
  });

  it('removes a selected progress photo without touching the rest', () => {
    expect(removeFromProgressManifest([first, second], first.filename)).toEqual([second]);
  });
});
