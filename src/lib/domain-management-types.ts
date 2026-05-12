export type DomainUserRow = {
  id: string;
  branch: string;
  topDistributor: string;
  distributor: string;
  wallet: string;
  totalDeposit: string;
  domain: string;
  username: string;
  createdAt: string;
};

export type DomainRow = {
  id: string;
  distributorId?: string;
  headquarters: string;
  topDistributor: string;
  distributor: string;
  loginId: string;
  companyName: string;
  url: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  depositEnabled: boolean;
  createdAt: string;
  users: DomainUserRow[];
};

export type DomainDistributorOption = {
  id: string;
  name: string;
};
