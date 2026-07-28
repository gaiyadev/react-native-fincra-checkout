import { UrlHandler } from '../src/utils/UrlHandler';

// ─── UrlHandler Tests ──────────────────────────────────────────────────────────
//
// Mirrors the test expectations for the Flutter UrlHandler class.
// Covers all branches: prefix match, query-param fallback, and edge cases.

describe('UrlHandler.isCompletionUrl', () => {
  // ── With expectedRedirectUrl ────────────────────────────────────────────────

  describe('when expectedRedirectUrl is provided', () => {
    const redirectUrl = 'https://api.example.com/payment/callback';

    it('returns true when URL starts with the redirect URL (exact match)', () => {
      expect(UrlHandler.isCompletionUrl(redirectUrl, redirectUrl)).toBe(true);
    });

    it('returns true when URL starts with the redirect URL (with query params)', () => {
      const url = `${redirectUrl}?status=success&reference=REF123`;
      expect(UrlHandler.isCompletionUrl(url, redirectUrl)).toBe(true);
    });

    it('returns true when URL starts with redirect URL (with path extension)', () => {
      const url = `${redirectUrl}/result`;
      expect(UrlHandler.isCompletionUrl(url, redirectUrl)).toBe(true);
    });

    it('returns false when URL does NOT start with the redirect URL', () => {
      const url = 'https://checkout.fincra.com/pay/abc123';
      expect(UrlHandler.isCompletionUrl(url, redirectUrl)).toBe(false);
    });

    it('returns false when URL is completely different', () => {
      expect(
        UrlHandler.isCompletionUrl('https://google.com', redirectUrl)
      ).toBe(false);
    });

    it('ignores query params on the expected redirect URL (prefix match)', () => {
      // This is intentional — we trust the redirect URL as a prefix
      const urlWithParams = `${redirectUrl}?status=failed&ref=X`;
      expect(UrlHandler.isCompletionUrl(urlWithParams, redirectUrl)).toBe(true);
    });
  });

  // ── Without expectedRedirectUrl (fallback) ──────────────────────────────────

  describe('when no expectedRedirectUrl is provided (fallback mode)', () => {
    it('returns true when URL has both "status" and "reference" params', () => {
      const url =
        'https://checkout.fincra.com/done?status=success&reference=REF-001';
      expect(UrlHandler.isCompletionUrl(url)).toBe(true);
    });

    it('returns true when URL has "payment_status" instead of "status"', () => {
      const url =
        'https://checkout.fincra.com/done?payment_status=successful&reference=REF-002';
      expect(UrlHandler.isCompletionUrl(url)).toBe(true);
    });

    it('returns false when "reference" param is missing', () => {
      const url = 'https://checkout.fincra.com/done?status=success';
      expect(UrlHandler.isCompletionUrl(url)).toBe(false);
    });

    it('returns false when "status" param is missing', () => {
      const url = 'https://checkout.fincra.com/done?reference=REF-003';
      expect(UrlHandler.isCompletionUrl(url)).toBe(false);
    });

    it('returns false for a plain checkout URL with no params', () => {
      const url = 'https://checkout.fincra.com/pay/abc123';
      expect(UrlHandler.isCompletionUrl(url)).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(UrlHandler.isCompletionUrl('')).toBe(false);
    });

    it('returns false for a malformed URL', () => {
      expect(UrlHandler.isCompletionUrl('not-a-url')).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles URL-encoded query param values', () => {
      const url =
        'https://example.com/callback?status=success&reference=REF%20123';
      expect(UrlHandler.isCompletionUrl(url)).toBe(true);
    });

    it('returns false when URL has empty query string', () => {
      expect(UrlHandler.isCompletionUrl('https://example.com?')).toBe(false);
    });

    it('falls through to query param check when expectedRedirectUrl is an empty string (Fix #22)', () => {
      const url =
        'https://checkout.fincra.com/done?status=success&reference=REF-007';
      expect(UrlHandler.isCompletionUrl(url, '')).toBe(true);
      expect(
        UrlHandler.isCompletionUrl('https://checkout.fincra.com/done', '')
      ).toBe(false);
    });

    it('safely extracts empty params from a redirectUrl without query params and assumes success status in completion flow (Fix #21)', () => {
      const redirectUrl = 'https://api.example.com/payment/callback';
      expect(UrlHandler.isCompletionUrl(redirectUrl, redirectUrl)).toBe(true);
      const params = UrlHandler.extractResponseParams(redirectUrl);
      const rawStatus = params['status']?.toLowerCase() ?? 'success';
      expect(rawStatus).toBe('success');
      expect(UrlHandler.isSuccessStatus(rawStatus)).toBe(true);
    });
  });
});

// ─── UrlHandler.extractResponseParams ─────────────────────────────────────────

describe('UrlHandler.extractResponseParams', () => {
  it('extracts all query parameters as string key-value pairs', () => {
    const url =
      'https://example.com/callback?status=success&reference=REF-001&transactionId=TXN-999';
    const params = UrlHandler.extractResponseParams(url);
    expect(params).toEqual({
      status: 'success',
      reference: 'REF-001',
      transactionId: 'TXN-999',
    });
  });

  it('returns empty object for a URL with no query string', () => {
    const params = UrlHandler.extractResponseParams('https://example.com/path');
    expect(params).toEqual({});
  });

  it('decodes URL-encoded values', () => {
    const url = 'https://example.com?message=Payment%20failed&status=error';
    const params = UrlHandler.extractResponseParams(url);
    expect(params['message']).toBe('Payment failed');
  });

  it('returns empty object for empty string', () => {
    expect(UrlHandler.extractResponseParams('')).toEqual({});
  });
});

// ─── UrlHandler.parsePaymentResponse ──────────────────────────────────────────

describe('UrlHandler.parsePaymentResponse', () => {
  it('uses "reference" as the primary reference when no customerReference exists', () => {
    const params = {
      reference: 'REF-001',
      transactionId: 'TXN-001',
      status: 'success',
    };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.reference).toBe('REF-001');
    expect(response.transactionId).toBe('TXN-001');
    expect(response.status).toBe('success');
  });

  it('prefers "customerReference" over plain "reference"', () => {
    const params = {
      reference: 'FINCRA-INTERNAL-001',
      customerReference: 'MERCHANT-REF-001',
      transactionId: 'TXN-002',
      status: 'success',
    };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.reference).toBe('MERCHANT-REF-001');
  });

  it('falls back to "merchantReference" if "customerReference" is absent', () => {
    const params = {
      reference: 'FINCRA-INTERNAL-002',
      merchantReference: 'MERCHANT-REF-002',
      status: 'success',
    };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.reference).toBe('MERCHANT-REF-002');
  });

  it('uses "transactionReference" when present', () => {
    const params = {
      customerReference: 'CUST-REF',
      transactionReference: 'TXN-REF-001',
      status: 'success',
    };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.transactionId).toBe('TXN-REF-001');
  });

  it('includes all raw params in rawResponse', () => {
    const params = {
      reference: 'REF-003',
      status: 'success',
      extra: 'data',
    };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.rawResponse).toEqual(params);
  });

  it('defaults status to "unknown" when missing', () => {
    const params = { reference: 'REF-004' };
    const response = UrlHandler.parsePaymentResponse(params);
    expect(response.status).toBe('unknown');
  });
});

// ─── UrlHandler.isSuccessStatus ───────────────────────────────────────────────

describe('UrlHandler.isSuccessStatus', () => {
  it('returns true for "success"', () => {
    expect(UrlHandler.isSuccessStatus('success')).toBe(true);
  });

  it('returns true for "successful"', () => {
    expect(UrlHandler.isSuccessStatus('successful')).toBe(true);
  });

  it('returns true for case-insensitive variants', () => {
    expect(UrlHandler.isSuccessStatus('SUCCESS')).toBe(true);
    expect(UrlHandler.isSuccessStatus('Successful')).toBe(true);
  });

  it('returns false for "failed"', () => {
    expect(UrlHandler.isSuccessStatus('failed')).toBe(false);
  });

  it('returns false for "error"', () => {
    expect(UrlHandler.isSuccessStatus('error')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(UrlHandler.isSuccessStatus('')).toBe(false);
  });
});
