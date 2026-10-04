import { parseMessage, FincraBridgeEvent } from '../src/inline/JsBridge';

// ─── JsBridge / parseMessage Tests ────────────────────────────────────────────
//
// Mirrors the javascript_bridge.dart test expectations.
// Validates all event types, data normalization, and malformed input handling.

describe('parseMessage — event detection', () => {
  it('parses a "ready" event', () => {
    const msg = parseMessage(JSON.stringify({ event: 'ready' }));
    expect(msg.event).toBe(FincraBridgeEvent.Ready);
    expect(msg.data).toBeUndefined();
  });

  it('parses a "closed" event', () => {
    const msg = parseMessage(JSON.stringify({ event: 'closed' }));
    expect(msg.event).toBe(FincraBridgeEvent.Closed);
    expect(msg.data).toBeUndefined();
  });

  it('parses an "error" event with a message', () => {
    const msg = parseMessage(
      JSON.stringify({ event: 'error', data: { message: 'SDK failed to load' } })
    );
    expect(msg.event).toBe(FincraBridgeEvent.Error);
    expect(msg.data).toEqual({ message: 'SDK failed to load' });
  });

  it('parses an "error" event without a message gracefully', () => {
    const msg = parseMessage(JSON.stringify({ event: 'error', data: {} }));
    expect(msg.event).toBe(FincraBridgeEvent.Error);
    expect((msg.data as { message: string }).message).toBe(
      'An unknown error occurred'
    );
  });

  it('returns Unknown event for an unrecognized event string', () => {
    const msg = parseMessage(JSON.stringify({ event: 'foobar' }));
    expect(msg.event).toBe(FincraBridgeEvent.Unknown);
  });

  it('returns Unknown event for malformed JSON', () => {
    const msg = parseMessage('not valid json {{{');
    expect(msg.event).toBe(FincraBridgeEvent.Unknown);
    expect(msg.data).toBeUndefined();
  });

  it('returns Unknown event for an empty string', () => {
    const msg = parseMessage('');
    expect(msg.event).toBe(FincraBridgeEvent.Unknown);
  });

  it('returns Unknown event for a JSON null', () => {
    const msg = parseMessage('null');
    expect(msg.event).toBe(FincraBridgeEvent.Unknown);
  });
});

// ─── parseMessage — success data normalization ─────────────────────────────────

describe('parseMessage — success event data normalization', () => {
  it('parses a basic success payload', () => {
    const payload = {
      event: 'success',
      data: {
        reference: 'REF-001',
        transactionId: 'TXN-001',
        status: 'success',
      },
    };
    const msg = parseMessage(JSON.stringify(payload));
    expect(msg.event).toBe(FincraBridgeEvent.Success);
    const data = msg.data as { reference: string; transactionId: string; status: string };
    expect(data.reference).toBe('REF-001');
    expect(data.transactionId).toBe('TXN-001');
    expect(data.status).toBe('success');
  });

  it('injects status="success" when missing from data', () => {
    const payload = {
      event: 'success',
      data: { reference: 'REF-002', transactionId: 'TXN-002' },
    };
    const msg = parseMessage(JSON.stringify(payload));
    expect(msg.event).toBe(FincraBridgeEvent.Success);
    const data = msg.data as { status: string };
    expect(data.status).toBe('success');
  });

  it('normalizes customerReference to reference field', () => {
    const payload = {
      event: 'success',
      data: {
        customerReference: 'MERCHANT-REF-001',
        reference: 'FINCRA-INTERNAL',
        transactionId: 'TXN-003',
        status: 'success',
      },
    };
    const msg = parseMessage(JSON.stringify(payload));
    const data = msg.data as { reference: string };
    expect(data.reference).toBe('MERCHANT-REF-001');
  });

  it('normalizes transactionReference to transactionId', () => {
    const payload = {
      event: 'success',
      data: {
        customerReference: 'CUST-REF',
        transactionReference: 'TXN-REF-001',
        status: 'success',
      },
    };
    const msg = parseMessage(JSON.stringify(payload));
    const data = msg.data as { transactionId: string };
    expect(data.transactionId).toBe('TXN-REF-001');
  });

  it('coerces non-string data values to strings (mirrors Flutter)', () => {
    const payload = {
      event: 'success',
      data: {
        reference: 'REF-005',
        amount: 5000,         // number
        status: 'success',
        verified: true,       // boolean
      },
    };
    const msg = parseMessage(JSON.stringify(payload));
    // Coerced values land in rawResponse (the full string param map)
    const data = msg.data as { rawResponse: Record<string, string> };
    expect(typeof data.rawResponse['amount']).toBe('string');
    expect(data.rawResponse['amount']).toBe('5000');
    expect(data.rawResponse['verified']).toBe('true');
  });

  it('populates rawResponse with all original params', () => {
    const payload = {
      event: 'success',
      data: {
        reference: 'REF-006',
        transactionId: 'TXN-006',
        status: 'success',
        extra: 'metadata',
      },
    };
    const msg = parseMessage(JSON.stringify(payload));
    const data = msg.data as { rawResponse: Record<string, string> };
    expect(data.rawResponse).toMatchObject({
      reference: 'REF-006',
      extra: 'metadata',
    });
  });

  // Item 7: a success without data is still a success (was reported as cancelled)
  it('treats success event with null or missing data as success with empty references', () => {
    for (const payload of [{ event: 'success', data: null }, { event: 'success' }]) {
      const msg = parseMessage(JSON.stringify(payload));
      expect(msg.event).toBe(FincraBridgeEvent.Success);
      expect(msg.data).toEqual({
        reference: '',
        transactionId: '',
        status: 'success',
        message: undefined,
        rawResponse: { status: 'success' },
      });
    }
  });

  it('treats success event with non-object data (string or array) as success without crashing', () => {
    for (const data of ['not-an-object', ['item1', 'item2']]) {
      const msg = parseMessage(JSON.stringify({ event: 'success', data }));
      expect(msg.event).toBe(FincraBridgeEvent.Success);
      expect(msg.data).toMatchObject({ reference: '', status: 'success' });
    }
  });

  // Item 8: normalise success data
  it('JSON-encodes nested objects and arrays instead of "[object Object]"', () => {
    const msg = parseMessage(
      JSON.stringify({
        event: 'success',
        data: {
          reference: 'REF-007',
          customer: { name: 'Jane', email: 'jane@example.com' },
          methods: ['card', 'bank_transfer'],
        },
      })
    );
    const raw = (msg.data as { rawResponse: Record<string, string> }).rawResponse;
    expect(JSON.parse(raw['customer'])).toEqual({
      name: 'Jane',
      email: 'jane@example.com',
    });
    expect(JSON.parse(raw['methods'])).toEqual(['card', 'bank_transfer']);
  });

  it('drops null values instead of producing the string "null"', () => {
    const msg = parseMessage(
      JSON.stringify({
        event: 'success',
        data: { reference: 'REF-008', customerReference: null, message: null },
      })
    );
    const data = msg.data as {
      reference: string;
      message?: string;
      rawResponse: Record<string, string>;
    };
    expect(data.reference).toBe('REF-008');
    expect(data.message).toBeUndefined();
    expect(data.rawResponse).not.toHaveProperty('customerReference');
    expect(data.rawResponse).not.toHaveProperty('message');
  });

  it('sets status to "success" when status is null', () => {
    const msg = parseMessage(
      JSON.stringify({ event: 'success', data: { reference: 'R', status: null } })
    );
    expect((msg.data as { status: string }).status).toBe('success');
  });
});
