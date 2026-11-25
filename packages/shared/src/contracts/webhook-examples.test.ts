import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS } from './changes';
import { WEBHOOK_PAYLOAD_EXAMPLES } from './webhook-examples';

describe('WEBHOOK_PAYLOAD_EXAMPLES', () => {
  it('has one example for every webhook event and the batch', () => {
    expect(Object.keys(WEBHOOK_PAYLOAD_EXAMPLES).sort()).toEqual(
      [...WEBHOOK_EVENTS, 'alerts.batch'].sort(),
    );
  });

  it('files every example under its own event name', () => {
    for (const [event, payload] of Object.entries(WEBHOOK_PAYLOAD_EXAMPLES)) {
      expect(payload.event).toBe(event);
    }
  });

  it('round trips through JSON unchanged', () => {
    expect(JSON.parse(JSON.stringify(WEBHOOK_PAYLOAD_EXAMPLES))).toEqual(
      WEBHOOK_PAYLOAD_EXAMPLES,
    );
  });
});
