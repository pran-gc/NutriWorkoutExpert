import { Alert } from 'react-native';

import { confirmDelete } from './SwipeToDelete';

describe('confirmDelete (swipe-to-delete guard)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('deletes only when the user confirms', () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    const onDelete = jest.fn();
    confirmDelete({ title: 'Delete routine?', message: 'x', onDelete });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does nothing (and closes the row) when cancelled', () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Cancel')?.onPress?.();
    });
    const onDelete = jest.fn();
    const onCancel = jest.fn();
    confirmDelete({ title: 'Delete?', message: 'x', onDelete, onCancel });
    expect(onDelete).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
