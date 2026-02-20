import { humanizeStepMessage } from './stepText';

describe('stepText', () => {
  it('humanizes finalize split notation into plain language', () => {
    const input =
      'Finalize split old leaf child @8 -> hash-ref 0x96f99bf955caca6cf15b04e76c70698283902e22234e2fc903f8260eab5b6887';
    const output = humanizeStepMessage(input);

    expect(output).toContain('Split existing leaf path');
    expect(output).toContain('branch index 8');
    expect(output).toContain('stored by hash reference');
    expect(output).not.toContain('@8');
    expect(output).not.toContain('hash-ref');
  });
});
