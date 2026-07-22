import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MarkdownText } from './MarkdownText';

test('paragraphs size to their content instead of filling the message card', async () => {
  const screen = await render(<MarkdownText>{'First paragraph.\n\nSecond paragraph.'}</MarkdownText>);

  const paragraphStyle = StyleSheet.flatten(screen.getByText('First paragraph.').props.style);
  expect(paragraphStyle.flex).toBeUndefined();
  expect(screen.getByText('Second paragraph.')).toBeTruthy();
});

test('renders common assistant markdown without showing its control characters', async () => {
  const screen = await render(
    <MarkdownText>{'Press **100 kg** steadily.\n1. **Recovery:** Eat well.\n- Keep your form controlled.'}</MarkdownText>,
  );

  expect(screen.getByText('100 kg')).toBeTruthy();
  expect(screen.getByText('Recovery:')).toBeTruthy();
  expect(screen.queryByText(/\*\*/)).toBeNull();
  expect(screen.getByText('1.')).toBeTruthy();
  expect(screen.getByText('•')).toBeTruthy();
});
