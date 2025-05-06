/**
 * Tests for the amount parser utility functions
 */

import { parseHungarianAmount } from './amountParser';
import { describe, expect, test } from '@jest/globals';

describe('parseHungarianAmount', () => {
  test('correctly parses simple numbers', () => {
    expect(parseHungarianAmount('100')).toBe(100);
    expect(parseHungarianAmount('123.45')).toBe(123.45);
  });

  test('handles Hungarian dot as thousands separator', () => {
    expect(parseHungarianAmount('1.234')).toBe(1234);
    expect(parseHungarianAmount('12.345')).toBe(12345);
    expect(parseHungarianAmount('123.456')).toBe(123456);
    expect(parseHungarianAmount('1.234.567')).toBe(1234567);
  });

  test('handles Hungarian space as thousands separator', () => {
    expect(parseHungarianAmount('1 234')).toBe(1234);
    expect(parseHungarianAmount('12 345')).toBe(12345);
    expect(parseHungarianAmount('123 456')).toBe(123456);
    expect(parseHungarianAmount('1 234 567')).toBe(1234567);
  });

  test('handles Hungarian comma as decimal separator', () => {
    expect(parseHungarianAmount('123,45')).toBe(123.45);
    expect(parseHungarianAmount('1,5')).toBe(1.5);
    expect(parseHungarianAmount('0,99')).toBe(0.99);
  });

  test('handles combination of thousands and decimal separators', () => {
    expect(parseHungarianAmount('1.234,56')).toBe(1234.56);
    expect(parseHungarianAmount('12.345,67')).toBe(12345.67);
    expect(parseHungarianAmount('1 234,56')).toBe(1234.56);
    expect(parseHungarianAmount('12 345,67')).toBe(12345.67);
  });

  test('handles currency symbols', () => {
    expect(parseHungarianAmount('123.456 Ft')).toBe(123456);
    expect(parseHungarianAmount('123.456 HUF')).toBe(123456);
    expect(parseHungarianAmount('123.456,78 Ft')).toBe(123456.78);
    expect(parseHungarianAmount('Ft 123.456')).toBe(123456);
    expect(parseHungarianAmount('Ft. 123 456,78')).toBe(123456.78);
  });

  test('handles whitespace and extra characters', () => {
    expect(parseHungarianAmount(' 123.456 ')).toBe(123456);
    expect(parseHungarianAmount('Price: 123.456 Ft')).toBe(123456);
    expect(parseHungarianAmount('Összesen: 123 456,78 Ft.')).toBe(123456.78);
    expect(parseHungarianAmount('Fizetendő: 123.456')).toBe(123456);
  });

  test('preserves small amounts without adjustment', () => {
    expect(parseHungarianAmount('9')).toBe(9); // Small amount remains as is
    expect(parseHungarianAmount('7')).toBe(7); // Small amount remains as is
    expect(parseHungarianAmount('3.45')).toBe(3.45); // Decimal remains as is
  });

  test('handles invalid inputs gracefully', () => {
    expect(parseHungarianAmount('')).toBe(0);
    expect(parseHungarianAmount('abc')).toBe(0);
    expect(parseHungarianAmount('Ft')).toBe(0);
  });
}); 