import { extractBillData } from '../services/billExtractor';
// Jest types
import '@types/jest';

describe('Pattern-based Bill Extractor', () => {
  describe('English Bill Detection', () => {
    it('should extract utility bill information in English', () => {
      const subject = 'Your Monthly Electricity Bill';
      const body = `
Dear Customer,

Your electricity bill for the month of May is now available.

Account Number: ACCT12345
Statement Date: 05/15/2023
Due Date: 06/01/2023

Current Charges: $124.56

Please pay by the due date to avoid late fees.
Thank you for being our customer!

Power Utilities Inc.
      `;

      const result = extractBillData(subject, body);
      
      expect(result).not.toBeNull();
      expect(result?.language).toBe('en');
      expect(result?.type).toBe('en-utility');
      expect(result?.amount).toBe(124.56);
      expect(result?.currency).toBe('USD');
      expect(result?.accountNumber).toBe('ACCT12345');
      expect(result?.dueDate?.getMonth()).toBe(5); // June is month 5 (0-based)
      expect(result?.dueDate?.getDate()).toBe(1);
      expect(result?.dueDate?.getFullYear()).toBe(2023);
    });

    it('should extract subscription bill information in English', () => {
      const subject = 'Your Netflix subscription payment receipt';
      const body = `
Netflix

Payment Receipt
Date: May 10, 2023

Hi John,

We've charged your payment method for your monthly subscription:

Amount: $15.99

Your next billing date is June 10, 2023.

Account: netflix12345
      `;

      const result = extractBillData(subject, body);
      
      expect(result).not.toBeNull();
      expect(result?.language).toBe('en');
      expect(result?.type).toBe('en-subscription');
      expect(result?.amount).toBe(15.99);
      expect(result?.currency).toBe('USD');
      expect(result?.accountNumber).toBe('netflix12345');
    });
  });

  describe('Hungarian Bill Detection', () => {
    it('should extract utility bill information in Hungarian', () => {
      const subject = 'Áramszámla értesítő';
      const body = `
Tisztelt Ügyfelünk!

Elkészült az új áramszámlája.

Ügyfélszám: 123456789
Számla kelte: 2023.05.15
Fizetési határidő: 2023.06.01

Fizetendő összesen: 45 678 Ft

Kérjük, a határidőig fizesse be számláját.
Köszönjük, hogy ügyfelünk!

Áramszolgáltató Zrt.
      `;

      const result = extractBillData(subject, body);
      
      expect(result).not.toBeNull();
      expect(result?.language).toBe('hu');
      expect(result?.type).toBe('hu-utility');
      expect(result?.amount).toBe(45678);
      expect(result?.currency).toBe('HUF');
      expect(result?.accountNumber).toBe('123456789');
      expect(result?.dueDate?.getMonth()).toBe(5); // June is month 5 (0-based)
      expect(result?.dueDate?.getDate()).toBe(1);
      expect(result?.dueDate?.getFullYear()).toBe(2023);
      expect(result?.vendor).toBe('Áramszolgáltató Zrt.');
    });

    it('should extract telco bill information in Hungarian', () => {
      const subject = 'Telefonszámla értesítő';
      const body = `
Tisztelt Ügyfelünk!

Elkészült a mobilszámlája.

Azonosító: 98765432
Számla kelte: 2023.05.10
Beérkezési határidő: 2023.06.10

Számla összege: 8 990 Ft

Köszönjük, hogy szolgáltatásunkat választotta!

Telekom Zrt.
      `;

      const result = extractBillData(subject, body);
      
      expect(result).not.toBeNull();
      expect(result?.language).toBe('hu');
      expect(result?.type).toBe('hu-telco');
      expect(result?.amount).toBe(8990);
      expect(result?.currency).toBe('HUF');
      expect(result?.accountNumber).toBe('98765432');
      expect(result?.vendor).toBe('Telekom Zrt.');
    });
  });

  describe('Edge Cases', () => {
    it('should handle emails with no bill information', () => {
      const subject = 'Meeting tomorrow';
      const body = 'Let\'s meet tomorrow at 10am to discuss the project.';

      const result = extractBillData(subject, body);
      expect(result).toBeNull();
    });

    it('should handle bills with partial information', () => {
      const subject = 'Your electricity bill';
      const body = 'We noticed you haven\'t paid your last bill yet.';

      const result = extractBillData(subject, body);
      expect(result).toBeNull(); // Should return null because no amount found
    });
  });
}); 