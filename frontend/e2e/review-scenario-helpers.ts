import { expect, type Page } from "@playwright/test";

export async function openReviewCasePicker(page: Page) {
  const tools = page.getByRole("button", {name:"검토 도구",exact:true});
  await expect(tools, "Fixed fixture checks use NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true").toBeVisible();
  if (await tools.getAttribute("aria-expanded") !== "true") await tools.click();
  await page.getByRole("button", {name:"검증용 고정 사례 불러오기",exact:true}).click();
  return page.getByRole("dialog", {name:"검증용 고정 사례",exact:true});
}

export async function loadProductReviewCase(page: Page) {
  const picker = await openReviewCasePicker(page);
  await picker.getByRole("button", {name:"상품 배분 검토 불러오기",exact:true}).click();
}
