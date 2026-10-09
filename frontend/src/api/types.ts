// Hand-written from backend/openapi.json — keep in sync with the Spring Boot DTOs.
export interface CodeLabel { code: string; label: string }

export interface MeResponse {
  customerId: number;
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  tierCode: string;
  tierLabel: string;
  tierOptions: CodeLabel[];
  frequencyOptions: CodeLabel[];
  deliveryOptions: CodeLabel[];
  lastLogin?: string;
  sessionTimeoutSeconds: number;
}

export interface LoginRequest { userId: string; password: string; saveUserId: boolean }

export interface AccountResponse {
  accountId: string;
  typeCode: string;
  productName: string;
  last4: string;
  displayName: string;
  external: boolean;
  savings: boolean;
  externalBankName?: string;
  seqNo: number;
  statusCode: string;
  currentBalanceCents: number;
  currentBalance: string;
  availableBalanceCents: number;
  availableBalance: string;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  tierCode: string;
  delivery?: string;
  frequency?: string;
  scheduledDate?: string;
  memo?: string;
}

export interface QuoteResponse {
  ok: boolean;
  from: string;
  to: string;
  amount: string;
  fee: string;
  total: string;
  type: string;
  tier: string;
  delivery: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  feeCents: number;
  totalCents: number;
  typeCode: 'INT' | 'EXS' | 'EXN' | string;
  tierCode: string;
  frequencyCode: string;
  frequency: string;
  scheduledDate: string;
  deliveryDate: string;
}

export interface TransferResponse {
  confirmationNumber: string;
  statusCode: 'P' | 'S' | 'R' | string;
  status: string;
  scheduledDate: string;
  postDate: string;
  delivery: string;
  from: string;
  to: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  amount: string;
  feeCents: number;
  fee: string;
  totalCents: number;
  total: string;
  typeCode: string;
  type: string;
  tierCode: string;
  tier: string;
  frequencyCode: string;
  frequency: string;
  memo?: string;
  createdTs: string;
  heading?: string;
  note?: string;
  accounts?: AccountResponse[];
}

export interface ApiErrorBody { ok: false; status: number; code: string; message: string }
