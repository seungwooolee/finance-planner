import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssetReference } from '../../src/components/dion/asset-reference';
import { useAssetReferenceSelection } from '../../src/components/dion/use-asset-reference-selection';
import type { Json } from '../../src/lib/dion/model';

const snapshot = (window as unknown as {reference: Json}).reference;
function Comparison() {
  const [final, setFinal] = useState(false), [source, setSource] = useState('run-1');
  const [selection, select] = useAssetReferenceSelection(source);
  return <div className="dion-app"><main className="d-main">
    <button onClick={() => setFinal(!final)}>{final ? '재무현황으로' : '포트폴리오로'}</button>
    <button onClick={() => setSource('run-2')}>다른 계산 결과</button>
    <AssetReference value={snapshot} stale={false} compact={final} selection={selection} onSelect={select}/>
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Comparison/>);
