import { keyboardAvoidingBehavior } from '@/components/KeyboardSafeView';

describe('keyboardAvoidingBehavior', () => {
  it('uses bottom padding on iOS', () => {
    expect(keyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('resizes available height on Android', () => {
    expect(keyboardAvoidingBehavior('android')).toBe('height');
  });
});
