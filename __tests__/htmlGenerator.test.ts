import {
  buildInlineOptions,
  generateInlineHtml,
  toScriptJson,
  type InlinePaymentConfig,
} from '../src/inline/htmlGenerator';

// ─── htmlGenerator Tests ──────────────────────────────────────────────────────
//
// Covers the pure options builder (optional phone number, optional fields)
// and the injection-safe embedding of options into the generated page.

const baseConfig: InlinePaymentConfig = {
  publicKey: 'pk_test_123',
  amount: 5000,
  currency: 'NGN',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  feeBearer: 'customer',
};

describe('buildInlineOptions — phone number (optional)', () => {
  it('omits phoneNumber when it is missing', () => {
    const options = buildInlineOptions(baseConfig);
    expect(options.customer).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    expect('phoneNumber' in options.customer).toBe(false);
  });

  it('omits phoneNumber when it is blank (spaces only)', () => {
    const options = buildInlineOptions({
      ...baseConfig,
      customerPhoneNumber: '   ',
    });
    expect('phoneNumber' in options.customer).toBe(false);
  });

  it('trims the phone number when present', () => {
    const options = buildInlineOptions({
      ...baseConfig,
      customerPhoneNumber: ' 0801 ',
    });
    expect(options.customer.phoneNumber).toBe('0801');
  });

  it('never emits phoneNumber as null or "" in the generated page', () => {
    const html = generateInlineHtml(baseConfig);
    expect(html).not.toContain('phoneNumber');

    const withPhone = generateInlineHtml({
      ...baseConfig,
      customerPhoneNumber: ' 0801 ',
    });
    expect(withPhone).toContain('"phoneNumber":"0801"');
  });
});

describe('buildInlineOptions — other fields', () => {
  it('maps required fields and upper-cases the currency', () => {
    const options = buildInlineOptions({
      ...baseConfig,
      currency: 'ngn' as InlinePaymentConfig['currency'],
    });
    expect(options).toEqual({
      key: 'pk_test_123',
      amount: 5000,
      currency: 'NGN',
      feeBearer: 'customer',
      customer: { name: 'Jane Doe', email: 'jane@example.com' },
    });
  });

  it('includes reference and paymentMethods only when provided', () => {
    expect(buildInlineOptions(baseConfig)).not.toHaveProperty('reference');
    expect(
      buildInlineOptions({ ...baseConfig, paymentMethods: [] })
    ).not.toHaveProperty('paymentMethods');

    const options = buildInlineOptions({
      ...baseConfig,
      reference: 'ORDER-1',
      paymentMethods: ['card'],
    });
    expect(options.reference).toBe('ORDER-1');
    expect(options.paymentMethods).toEqual(['card']);
  });
});

describe('generateInlineHtml — injection safety', () => {
  it('cannot be broken out of with a closing </script> tag', () => {
    const html = generateInlineHtml({
      ...baseConfig,
      customerName: '</script><script>alert(1)</script>',
    });
    // The only </script> occurrences are the page's own two script tags.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain('\\u003c/script\\u003e');
  });

  it('toScriptJson round-trips to the original value', () => {
    const value = { s: '</script>&<!--\u2028\u2029"\'' };
    const encoded = toScriptJson(value);
    expect(encoded).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(encoded)).toEqual(value);
  });

  it('keeps the polling loop for the Fincra global', () => {
    const html = generateInlineHtml(baseConfig);
    expect(html).toContain("typeof Fincra === 'undefined'");
    expect(html).toContain('Fincra SDK failed to load.');
  });
});
