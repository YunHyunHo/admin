export type LinkedDomain = {
  id: string;
  name: string;
  address: string;
  userCount: number;
};

export type AccountRow = {
  id: string;
  companyId?: string;
  distributorId?: string;
  branchName: string;
  creator: string;
  bankName: string;
  holder: string;
  accountNumber: string;
  createdAt: string;
  isActive: boolean;
  linkedDomains: LinkedDomain[];
};

export type AccountBranchOption = {
  id: string;
  name: string;
};
