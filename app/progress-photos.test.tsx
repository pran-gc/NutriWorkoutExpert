import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProgressPhotosScreen from './progress-photos';

const mockPhotos = [
  { filename: 'one.jpg', logged_on: '2026-07-01' },
  { filename: 'two.jpg', logged_on: '2026-07-08' },
  { filename: 'three.jpg', logged_on: '2026-07-11' },
];

let mockList = jest.fn(async () => mockPhotos);
jest.mock('@/lib/photos', () => ({
  addProgressPhoto: jest.fn(async () => null),
  listProgressPhotos: () => mockList(),
  localPhotoUri: (filename: string) => `file:///photos/${filename}`,
  removeProgressPhoto: jest.fn(async () => {}),
}));

describe('ProgressPhotosScreen', () => {
  afterEach(() => {
    mockList = jest.fn(async () => mockPhotos);
    jest.clearAllMocks();
  });

  it('renders the empty state', async () => {
    mockList = jest.fn(async () => []);
    const screen = await render(<ProgressPhotosScreen />);
    await waitFor(() => expect(screen.getByText('Add progress photos when you want a private visual record.')).toBeTruthy());
  });

  it('limits compare selection to two photos and renders zoomable compare panes', async () => {
    const screen = await render(<ProgressPhotosScreen />);
    await waitFor(() => expect(screen.getByTestId('progress-photo-one.jpg')).toBeTruthy());

    fireEvent.press(screen.getByTestId('progress-photo-one.jpg'));
    fireEvent.press(screen.getByTestId('progress-photo-two.jpg'));
    fireEvent.press(screen.getByTestId('progress-photo-three.jpg'));

    await waitFor(() => expect(screen.getByText('2/2')).toBeTruthy());
    expect(screen.getByTestId('compare-zoom-one.jpg')).toBeTruthy();
    expect(screen.getByTestId('compare-zoom-two.jpg')).toBeTruthy();
    expect(screen.queryByTestId('compare-zoom-three.jpg')).toBeNull();
  });
});
