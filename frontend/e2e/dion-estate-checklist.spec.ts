import {expect, test} from "@playwright/test";

test("retirement estate checklist opens official guidance and the existing asset input", async ({page}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/dion");
  await page.getByRole("button",{name:"가상 사례 불러오기",exact:true}).click();
  await page.getByRole("button",{name:"은퇴기 불러오기",exact:true}).click();
  const estate = page.getByRole("region",{name:"유산·상속 준비 결과",exact:true});
  await expect(estate.getByRole("table")).toContainText("5억원");
  await expect(estate.getByRole("table")).toContainText("10억원");
  const prep = estate.getByRole("region",{name:"생전에 준비할 서류",exact:true});
  await expect(prep).toContainText("다음 확인");
  await expect(prep).toContainText("부동산 명의·지분");
  await expect(prep).toContainText("채무 잔액과 증빙");
  expect(await estate.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  const after = estate.getByRole("region",{name:"상속 개시 후 조회·신고",exact:true});
  const filing = after.getByRole("button",{name:"신고 서류와 채무 증빙 보기",exact:true});
  await filing.press("Enter");
  const dialog = page.getByRole("dialog",{name:"dion AI 상담",exact:true});
  await expect(dialog.getByRole("status",{name:"등록된 상속 근거 답변"})).toContainText("상속재산과 평가 내역");
  await dialog.getByText("근거 보기",{exact:true}).click();
  await expect(dialog.getByRole("link",{name:/국세청 상속세 신고시/})).toHaveAttribute("href",/nts\.go\.kr/);
  await page.keyboard.press("Escape");
  await expect(filing).toBeFocused();
  await prep.getByRole("button",{name:"금융자산 명의 확인하기",exact:true}).click();
  await expect(page.locator("#d-financial-asset-owners")).toBeFocused();
});
