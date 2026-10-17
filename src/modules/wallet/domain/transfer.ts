export enum TransferStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type Transfer = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  fee: number;
  status: TransferStatus;
  createdAt: Date;
};
