import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import { defaultNextSteps } from "@/lib/admin-placeholder-config";

const customerCenterColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "문의 유형", value: "계정 / 거래 / 정산 / API" },
  { label: "업체", value: "연결 업체" },
  { label: "담당자", value: "관리자" },
  { label: "상태", value: "대기 / 처리중 / 완료" },
  { label: "생성일", value: "-" },
];

export default function CustomerCenterPage() {
  return (
    <AdminPlaceholderPage
      activeItem="customer-center"
      badge="Support"
      helperText="고객센터 문의와 운영 메모를 관리하는 화면입니다."
      eyebrow="Support View"
      title="고객센터"
      description="업체 문의, 처리 상태, 관리자 메모를 관리할 수 있는 탭입니다."
      columns={customerCenterColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
