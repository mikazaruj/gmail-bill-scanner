/**
 * Interface for extracted bill information
 */
export interface BillInfo {
  /**
   * The amount extracted from the bill, typically in the local currency
   */
  amount?: number;

  /**
   * The due date for payment if available
   */
  due_date?: string | null;

  /**
   * The vendor or service provider name if available
   */
  vendor?: string | null;

  /**
   * The invoice or reference number if available
   */
  invoice_number?: string | null;

  /**
   * Confidence score for the extraction (0-1)
   * Higher values indicate more confident extraction
   */
  confidence: number;

  /**
   * The detected service type (electricity, gas, etc.)
   */
  service_type?: string;

  /**
   * The currency of the amount (defaults to local currency)
   */
  currency?: string;

  /**
   * The period covered by the bill if available
   */
  period?: string;
} 