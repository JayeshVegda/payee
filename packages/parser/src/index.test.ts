import { describe, expect, it } from 'vitest';
import { normalizeLookupText, parseAmountTokenToPaise, parseQuickEntry } from './index.js';

describe('parseAmountTokenToPaise', () => {
  it.each([
    ['800', 80_000],
    ['2.5k', 250_000],
    ['12.5k', 1_250_000],
    ['1l', 10_000_000],
    ['1 lakh', 10_000_000],
    ['2.40lakh', 24_000_000],
    ['2,40lakh', 24_000_000],
    ['240 lakh', 2_400_000_000],
    ['0.75l', 7_500_000],
    ['1,000', 100_000]
  ])('parses %s exactly', (input, expected) => {
    expect(parseAmountTokenToPaise(input)).toBe(expected);
  });

  it.each(['', '0', '-5', '1.001', '2m', 'abc', '1.234567k'])('rejects %s', (input) => {
    expect(parseAmountTokenToPaise(input)).toBeNull();
  });
});

describe('normalizeLookupText', () => {
  it('normalizes case, punctuation and spacing deterministically', () => {
    expect(normalizeLookupText('  ABC   Tools & Co. ')).toBe('abc tools co');
  });
});

describe('new payee quick entry', () => {
  it('creates a deterministic review preview with cash as default', () => {
    const preview = parseQuickEntry('amit kumar 50l', {
      payees: [],
      categories: [],
      paymentMethods: [{ id: 1, code: 'cash', displayName: 'Cash', aliases: ['c', 'cash'] }]
    });
    expect(preview).toMatchObject({
      valid: true,
      payeeName: 'amit kumar',
      isNewPayee: true,
      amountPaise: 500_000_000,
      paymentMethodId: 1,
      needsReview: true
    });
  });
  it('does not mistake a 12-hour time or ISO date for another amount', () => {
    const preview = parseQuickEntry('amit kumar 800 yesterday 9:30am', {
      payees: [],
      categories: [],
      paymentMethods: [{ id: 1, code: 'cash', displayName: 'Cash', aliases: ['cash'] }]
    });
    expect(preview.amountPaise).toBe(80_000);
    expect(preview.errors).toEqual([]);
  });

  it('does not turn a longer new name into a partial alias match', () => {
    const preview = parseQuickEntry('abc bhai 2500 cash', {
      payees: [
        {
          id: 7,
          name: 'ABC Tools',
          normalizedNames: ['abc tools', 'abc'],
          defaultCategoryId: null,
          defaultPaymentMethodId: 1
        }
      ],
      categories: [],
      paymentMethods: [{ id: 1, code: 'cash', displayName: 'Cash', aliases: ['c', 'cash'] }]
    });
    expect(preview).toMatchObject({
      valid: true,
      payeeId: null,
      payeeName: 'abc bhai',
      isNewPayee: true,
      amountPaise: 250_000
    });
  });
});

describe('known payee defaults', () => {
  it('uses the payee category and method when they are not written explicitly', () => {
    const preview = parseQuickEntry('vijay patel 2500', {
      payees: [{
        id: 2,
        name: 'Vijay Patel',
        normalizedNames: ['vijay patel'],
        defaultCategoryId: 8,
        defaultPaymentMethodId: 3
      }],
      categories: [{ id: 8, name: 'Subcontractors', normalizedNames: ['subcontractors'] }],
      paymentMethods: [
        { id: 1, code: 'cash', displayName: 'Cash', aliases: ['cash'] },
        { id: 3, code: 'upi', displayName: 'UPI', aliases: ['upi'] }
      ]
    });
    expect(preview).toMatchObject({
      valid: true,
      categoryId: 8,
      paymentMethodId: 3,
      needsReview: false
    });
  });

  it('allows an explicit category word to override the payee default', () => {
    const preview = parseQuickEntry('suresh yadav 3l material', {
      payees: [{
        id: 4,
        name: 'Suresh Yadav',
        normalizedNames: ['suresh yadav'],
        defaultCategoryId: 1,
        defaultPaymentMethodId: 1
      }],
      categories: [
        { id: 1, name: 'Wages', normalizedNames: ['wages', 'wage'] },
        { id: 2, name: 'Materials', normalizedNames: ['materials', 'material'] }
      ],
      paymentMethods: [{ id: 1, code: 'cash', displayName: 'Cash', aliases: ['cash'] }]
    });
    expect(preview).toMatchObject({
      valid: true,
      amountPaise: 30_000_000,
      categoryId: 2,
      categoryName: 'Materials',
      needsReview: false
    });
  });
});
