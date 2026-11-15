import { Json, textValue } from "@/lib/dion/model";
import {
  WORKBOOK_PORTFOLIO_TARGETS, WORKBOOK_PRODUCT_REFERENCES, type WorkbookPortfolioTarget,
} from "@/lib/dion/workbook-scenario-targets";

export function WorkbookPortfolioChoices({ selected, onSelect, onProducts }: {
  selected: WorkbookPortfolioTarget | null;
  onSelect: (target: WorkbookPortfolioTarget) => void;
  onProducts: () => void;
}) {
  return <article className="d-card" aria-label="엑셀 투자구성 목표 비중">
    <h2>엑셀 투자구성 목표 비중</h2>
    <p>시연용 구성을 선택하면 상품 예시와 근거를 볼 수 있어요.</p>
    <div className="d-table-wrap"><table aria-label="투자 성향별 목표 비중">
      <thead><tr>
        <th scope="col">투자 성향</th>
        {WORKBOOK_PRODUCT_REFERENCES.map(({asset})=><th key={asset} scope="col">{asset}</th>)}
      </tr></thead>
      <tbody>{WORKBOOK_PORTFOLIO_TARGETS.map(target=><tr key={target.label}>
        <th scope="row"><button type="button" aria-pressed={target === selected}
          className={target === selected ? "d-primary" : "d-secondary"} onClick={()=>onSelect(target)}>{target.label}</button></th>
        {target.weights.map((weight,i)=><td key={WORKBOOK_PRODUCT_REFERENCES[i].asset}>{weight}%</td>)}
      </tr>)}</tbody>
    </table></div>
    {selected && <button type="button" className="d-text-button" onClick={onProducts}>선택한 시연 구성의 상품 보기 →</button>}
  </article>;
}

export function WorkbookPortfolioProducts({ selected, products, onChoose }: {
  selected: WorkbookPortfolioTarget | null;
  products: Record<string, Json>[];
  onChoose: () => void;
}) {
  return <article className="d-card" aria-label="선택한 시연 투자구성">
    <h2>{selected ? selected.label + " · 시연 투자구성" : "시연 투자구성 선택"}</h2>
    {selected ? <>
      <p>목표 비중이 있는 자산군의 상품을 조사본과 공식 자료에서 연결했어요. 실제 배분액은 투자예산과 상품 검토가 끝난 뒤 확인할 수 있어요.</p>
      <div className="d-table-wrap"><table aria-label="시연 구성의 조사 상품">
        <thead><tr><th scope="col">자산군</th><th scope="col">목표 비중</th><th scope="col">상품 예시</th><th scope="col">근거</th></tr></thead>
        <tbody>{WORKBOOK_PRODUCT_REFERENCES.map(({asset,code,sourceRow},i)=>{
          const weight = selected.weights[i];
          if (weight === 0) return null;
          const product = products.find(row => row.code === code);
          const officialSource = textValue(product?.official_source);
          return <tr key={asset}>
            <th scope="row">{asset}</th><td>{weight}%</td>
            <td>{product ? <>{textValue(product.name)}<small>{code}</small></> : "상품 근거 확인 대기"}</td>
            <td>{officialSource.startsWith("https://") &&
              <a href={officialSource} target="_blank" rel="noreferrer">공식 상품 자료 ↗</a>}
              <small>금융상품 조사본 {sourceRow.replace(":", " · ")}행</small></td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="d-inline-note">현금성 ETF의 원금손실 가능성·예금자보호 여부는 상품 자료에서 확인해요.</p>
    </> : <p>투자구성에서 안정 추구형·중립형·위험 추구형 중 하나를 선택해 주세요.</p>}
    <button type="button" className="d-text-button" onClick={onChoose}>{selected ? "시연 구성 다시 선택 →" : "시연 구성 선택하기 →"}</button>
  </article>;
}
