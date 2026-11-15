"use client";
import { useState } from 'react';
import { INITIAL_ASSET_REFERENCE, type AssetReferenceSelection } from '@/lib/dion/asset-reference';

/** One selection for both result views, scoped to the captured calculation. */
export function useAssetReferenceSelection(source: string) {
  const [saved, setSaved] = useState({source, selection: INITIAL_ASSET_REFERENCE});
  const selection = saved.source === source ? saved.selection : INITIAL_ASSET_REFERENCE;
  const select = (value: AssetReferenceSelection) => setSaved({source, selection: value});
  return [selection, select] as const;
}
