import { deliveryHeaders, signPayload } from './webhook-signature';

describe('signPayload', () => {
  it('signs the raw body with hmac-sha256 (known vector)', () => {
    expect(signPayload('mysecret', '{"hello":"world"}')).toBe(
      'sha256=c15378d6581bcd0759288df30dd0eaffadc4fa4258ffe3b8cbdf13555e7f329f',
    );
  });
});

describe('deliveryHeaders', () => {
  it('always carries content type and the event name', () => {
    const headers = deliveryHeaders('metadata.changed', '{}', null, 'job_1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Asobeast-Event']).toBe('metadata.changed');
    expect(headers).not.toHaveProperty('X-Asobeast-Signature');
  });

  it('adds a signature only when a secret is present', () => {
    const headers = deliveryHeaders(
      'rank.dropped',
      '{"a":1}',
      'topsecret',
      'job_1',
    );
    expect(headers['X-Asobeast-Signature']).toBe(
      signPayload('topsecret', '{"a":1}'),
    );
  });

  it('names the delivery so a receiver can drop a retried one', () => {
    const headers = deliveryHeaders(
      'rank.dropped',
      '{}',
      null,
      'instant~evt_1~webhook~wh_1',
    );
    expect(headers['X-Asobeast-Delivery']).toBe('instant~evt_1~webhook~wh_1');
  });
});
