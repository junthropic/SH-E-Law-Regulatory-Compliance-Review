import { readFileSync } from "node:fs";
import { Store } from "../server/store.js";
import { approveReviewBasis } from "../server/approval.js";
if (!process.argv[2])
  throw new Error("사용법: npm run approve -- 검토자가_작성한_승인.json");
const store = new Store();
try {
  approveReviewBasis(store, JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log("검토자·원문 해시·공보 대조 기록 저장 완료");
} finally {
  store.close();
}
