/**
 * Represents a bill extracted from an email
 */
interface ScannedBill {
  id: string;
  merchant: string;
  amount: number;
  date: Date;
  currency: string;
  category: string;
  billUrl?: string;
  dueDate?: Date;
  isPaid?: boolean;
  notes?: string;
}

export default ScannedBill; 