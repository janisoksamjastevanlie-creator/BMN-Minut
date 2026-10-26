import { useState } from 'react';
import type { BmnAsset, InventoryItem } from '../types';

// State modal & interaksi global (pencarian, quick action, QR, AI, menu mobile, cetak).
export const useUiState = () => {
  const [selectedAsset, setSelectedAsset] = useState<BmnAsset | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [printableData, setPrintableData] = useState<unknown>(null);

  return {
    selectedAsset, setSelectedAsset,
    selectedInventoryItem, setSelectedInventoryItem,
    isGlobalSearchOpen, setIsGlobalSearchOpen,
    isQuickActionOpen, setIsQuickActionOpen,
    isQrScannerOpen, setIsQrScannerOpen,
    isAiAssistantOpen, setIsAiAssistantOpen,
    isMobileMenuOpen, setIsMobileMenuOpen,
    // printableData sengaja bertipe any seperti pada kontrak lama.
    printableData: printableData as any, setPrintableData: setPrintableData as (data: any | null) => void
  };
};
