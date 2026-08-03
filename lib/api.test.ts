import { ApiClientError, unwrap } from '@/lib/api';

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn(async () => body),
  };
}

describe('unwrap', () => {
  it('returns data from a success envelope', async () => {
    await expect(unwrap<{ value: number }>(response({ data: { value: 1 } }))).resolves.toEqual({
      value: 1,
    });
  });

  it('throws typed API errors from error envelopes', async () => {
    await expect(
      unwrap(response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }))
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNAUTHENTICATED',
      message: 'Sign in required.',
    });
  });

  it('throws instead of returning undefined for unexpected envelopes', async () => {
    await expect(unwrap(response({ message: 'Not Found' }))).rejects.toBeInstanceOf(ApiClientError);
    await expect(unwrap(response({ data: undefined }))).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Unexpected response from server.',
    });
    await expect(unwrap(response(null))).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Unexpected response from server.',
    });
  });
});
