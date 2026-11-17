import { billplzSignature, verifyBillplz } from './billplz';

describe('billplz signature', () => {
  const key = 'S-test-key';
  const params = { id: 'W_79pJDk', collection_id: 'inbmmepb', paid: 'true', state: 'paid', amount: '200', paid_amount: '200', due_at: '2020-12-31', email: 'a@b.com', mobile: '', name: 'A', url: 'https://x', paid_at: '2020-12-31 12:00:00 +0800' };

  it('builds the source string in case-insensitive order and verifies', () => {
    const sig = billplzSignature(params, key);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyBillplz({ ...params, x_signature: sig }, sig, key)).toBe(true);
    expect(verifyBillplz({ ...params, amount: '1' }, sig, key)).toBe(false);
  });
});
