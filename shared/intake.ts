import type { LookupServiceId } from "./public-apis.js";
import { z } from "zod";
import type { ReviewRequest } from "./types.js";
export const intakeFields = [
  [
    "material",
    "물질명·제품명",
    "사용하는 물질명·제품명과 SDS를 확인해 주세요.",
  ],
  [
    "cas",
    "CAS 번호",
    "성분별 CAS 번호를 확인해 주세요. 혼합물은 성분별 정보가 필요합니다.",
  ],
  ["concentration", "농도·함량", "농도와 질량/부피 기준을 확인해 주세요."],
  [
    "quantity",
    "최대 수량·단위",
    "물질별 최대 저장량·취급량과 단위를 확인해 주세요.",
  ],
  [
    "facility",
    "시설·작업 장소",
    "저장 장소, 시설 구분과 합산 대상 구역을 확인해 주세요.",
  ],
  [
    "activity",
    "작업·변경 내용",
    "수행하는 작업과 변경하려는 내용을 확인해 주세요.",
  ],
  [
    "permit",
    "허가·신고 상태",
    "기존 허가·신고 내용과 변경 범위를 확인해 주세요. 서류 미제공은 무허가가 아닙니다.",
  ],
  ["dates", "설치·변경 시점", "설치·변경·사용 시작일을 확인해 주세요."],
] as const;
export const FactKey = z.enum([
  "material",
  "cas",
  "concentration",
  "quantity",
  "facility",
  "activity",
  "permit",
  "dates",
]);
export const IntakeFactSchema = z.object({
  key: FactKey,
  value: z.string().max(1000),
  quote: z.string().max(1500).default(""),
  confirmed: z.boolean().default(false),
});
export type IntakeFact = z.infer<typeof IntakeFactSchema>;
export type LookupStep = {
  id: string;
  service: "law" | "ordinance" | LookupServiceId;
  filters?: Record<string, string>;
  label: string;
  keyword: string;
  mode: string;
  reason: string;
  status: "pending" | "running" | "ok" | "empty" | "failed" | "skipped";
  message: string;
  count?: number;
  total?: number;
  fetchedAt?: string;
  records?: unknown[];
  excluded?: { title: string; cas: string; hash: string }[];
};
export type IntakeDraft = {
  id: string;
  createdAt: string;
  binding: string;
  request: ReviewRequest;
  status: "draft" | "planned" | "running" | "completed" | "failed";
  method: "local" | "ai";
  facts: IntakeFact[];
  questions: string[];
  warnings: string[];
  steps: LookupStep[];
  reportId?: string;
  error?: string;
};
