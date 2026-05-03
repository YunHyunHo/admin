import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  distributorWithdrawalColumns,
} from "@/lib/admin-placeholder-config";

export default function DistributorWithdrawalsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="distributor-withdrawals"
      badge="Distributor Withdrawals"
      helperText="총판 보유금 환전 신청을 승인/거절/완료 처리하는 화면입니다."
      eyebrow="Settlement View"
      title="총판 환전내역"
      description="총판 보유금 조회, 환전 신청 생성, 완료 처리와 중복 차감 방지를 담당하는 탭입니다."
      columns={distributorWithdrawalColumns}
      nextSteps={[
        "COMPLETED 전환 시 보유금을 1회만 차감하도록 트랜잭션을 구현합니다.",
        "처리 내역은 관리자 로그에 남깁니다.",
        "검색, 상태 필터, 엑셀 다운로드를 붙입니다.",
      ]}
    />
  );
}
