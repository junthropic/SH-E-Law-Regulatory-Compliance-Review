import { expect, it } from "vitest";
import { presentReview, resultText } from "../shared/result-language.js";
import { markdown, csv } from "../server/exports.js";
import { newReview } from "../server/reviews.js";
import { evidence, request } from "./helpers.js";
import { annexUrls } from "../server/sources.js";

it("내부 상태는 한국어로 표시하되 저장된 원문과 요청·인용을 바꾸지 않는다", () => {
  const r = newReview(request());
  r.status="completed";
  r.evidence=[evidence({text:"Original English SDS reference preserved."})];
  r.issues=[{id:"x",category:"more_data",title:"근거자료 상태",conclusion:"verified=false, complete=false, annexesComplete=false",conditions:[],exceptions:[],missing:[],nextActions:[],severity:"high",citations:[{evidenceId:r.evidence[0].id,quote:r.evidence[0].text}]}];
  const p=presentReview(r);
  expect(p.issues[0].conclusion).toContain("별표·서식 원본과 내용 대조 필요");
  expect(p.issues[0].conclusion).not.toMatch(/false|verified/);
  expect(p.issues[0].citations).toEqual(r.issues[0].citations);
  expect(r.issues[0].conclusion).toContain("verified=false");
  expect(markdown(r)).toContain("상태: 검토 완료");
  expect(csv(r)).not.toContain("annexesComplete=false");
  expect(resultText("문서의 verified=false", ["문서의 verified=false"])).toBe("문서의 verified=false");
});
it("별표의 다중 이미지 링크와 조문 안 표 이미지를 빠뜨리지 않는다", () => {
  const urls=annexUrls({별표서식이미지파일링크:["/LSW/flDownload.do?flSeq=1","/LSW/flDownload.do?flSeq=2"],조내용:'표 <img src="/flDownload.do?flSeq=3&amp;gubun=ELISIMG"> <img src="https://evil.test/flDownload.do?flSeq=4">'});
  expect(urls).toEqual(["https://www.law.go.kr/LSW/flDownload.do?flSeq=1","https://www.law.go.kr/LSW/flDownload.do?flSeq=2","https://www.law.go.kr/LSW/flDownload.do?flSeq=3&gubun=ELISIMG"]);
});
