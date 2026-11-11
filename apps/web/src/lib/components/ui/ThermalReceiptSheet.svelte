<script module lang="ts">
  import { tick } from "svelte";

  export interface ThermalReceiptBatch {
    batchNumber: string;
    expiryDate?: string | null;
  }

  export interface ThermalReceiptItem {
    name: string;
    unit?: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    batches?: ThermalReceiptBatch[];
  }

  export interface ThermalReceiptData {
    storeName?: string;
    branchName?: string | null;
    branchPhone?: string | null;
    sia?: string | null;
    pharmacistName?: string | null;
    invoiceNumber: string;
    transactionTime: string | Date;
    cashierName?: string | null;
    customerName?: string | null;
    priceTier?: string | null;
    patientName?: string | null;
    doctorName?: string | null;
    paymentMethod?: string | null;
    items: ThermalReceiptItem[];
    subtotal: number;
    discountAmount?: number;
    taxAmount?: number;
    tuslahAmount?: number;
    embalaseAmount?: number;
    roundingAmount?: number;
    grandTotal: number;
    paidAmount: number;
    changeAmount: number;
    isReprint?: boolean;
  }

  export function formatThermalDateTime(value: string | Date | null | undefined): string {
    if (!value) return "-";
    if (value instanceof Date) return value.toLocaleString("id-ID");
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("id-ID");
    return String(value);
  }

  export function formatThermalRupiah(amount: number | string | null | undefined): string {
    const n = Math.round(Number(amount || 0));
    const abs = Math.abs(n).toLocaleString("id-ID");
    return n < 0 ? `-Rp ${abs}` : `Rp ${abs}`;
  }

  export function mapCheckoutToThermalReceipt(result: any, branch?: any): ThermalReceiptData {
    const p = result?.payload ?? {};
    const items: ThermalReceiptItem[] = (p.items || []).map((item: any) => ({
      name: item.name || "Obat",
      unit: item.selectedUnit || item.unit || "",
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      subtotal: Number(item.subtotal || 0),
      batches: Array.isArray(item.batches)
        ? item.batches.map((b: any) => ({
            batchNumber: b.batchNumber || "-",
            expiryDate: b.expiryDate || "-"
          }))
        : []
    }));

    return {
      storeName: "APOTEK HAFIDZ FARMA",
      branchName: branch?.name || "KOTA TASIKMALAYA",
      branchPhone: branch?.phone || "-",
      sia: branch?.sia || "-",
      pharmacistName: branch?.pharmacistName || "-",
      invoiceNumber: result?.invoiceNumber || "-",
      transactionTime: result?.transactionTime || new Date().toISOString(),
      cashierName: p.cashierName || "Kasir Utama",
      customerName: p.customerName || "Umum",
      priceTier: p.items?.[0]?.priceTier?.toUpperCase() || "UMUM",
      patientName:
        p.patientName && p.patientName !== p.customerName && p.patientName !== "Pasien Umum"
          ? p.patientName
          : null,
      doctorName: p.doctorName || null,
      paymentMethod: p.paymentMethod || "CASH",
      items,
      subtotal: Number(p.subtotal || 0),
      discountAmount: Number(p.invoiceDiscount || 0),
      taxAmount: Number(p.taxAmount || 0),
      tuslahAmount: Number(p.tuslahAmount || 0),
      embalaseAmount: Number(p.embalaseAmount || 0),
      roundingAmount: Number(p.roundingAmount || 0),
      grandTotal: Number(p.grandTotal || 0),
      paidAmount: Number(p.cashPaid || 0),
      changeAmount: Number(p.changeAmount || 0),
      isReprint: false
    };
  }

  export function mapSaleToThermalReceipt(trx: any, branchFallback?: any): ThermalReceiptData {
    const items: ThermalReceiptItem[] = (trx?.items || []).map((item: any) => ({
      name: item.productName || item.name || "Obat",
      unit: item.unit || item.unitName || "",
      quantity: Number(item.qty ?? item.quantity ?? 0),
      unitPrice: Number(item.price ?? item.unitPrice ?? 0),
      subtotal: Number(item.subtotal ?? 0),
      batches: item.batchNo
        ? [{ batchNumber: item.batchNo, expiryDate: item.expDate || "-" }]
        : []
    }));

    return {
      storeName: "APOTEK HAFIDZ FARMA",
      branchName: trx?.branchName || branchFallback?.name || "KOTA TASIKMALAYA",
      branchPhone: trx?.branchPhone || branchFallback?.phone || "-",
      sia: trx?.sia || branchFallback?.sia || null,
      pharmacistName: trx?.pharmacistName || branchFallback?.pharmacistName || null,
      invoiceNumber: trx?.invoiceNo || trx?.invoiceNumber || "-",
      transactionTime: trx?.transactionTime || trx?.createdAt || new Date().toISOString(),
      cashierName: trx?.cashierName || "Kasir Utama",
      customerName: trx?.customerName || "Umum",
      priceTier: (trx?.transactionType || "UMUM").toUpperCase(),
      patientName: trx?.patientName || null,
      doctorName: trx?.doctorName || null,
      paymentMethod: trx?.paymentMethod || "CASH",
      items,
      subtotal: Number(trx?.subtotal || 0),
      discountAmount: Number(trx?.discountAmount || 0),
      taxAmount: Number(trx?.taxAmount || 0),
      tuslahAmount: Number(trx?.tuslahAmount || 0),
      embalaseAmount: Number(trx?.embalaseAmount || 0),
      roundingAmount: Number(trx?.roundingAmount || 0),
      grandTotal: Number(trx?.grandTotal || 0),
      paidAmount: Number(trx?.paidAmount || 0),
      changeAmount: Number(trx?.changeAmount || 0),
      isReprint: true
    };
  }

  export async function triggerThermalPrint(onAfterPrint?: () => void): Promise<() => void> {
    if (typeof window === "undefined") return () => {};
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const handleAfterPrint = () => {
      onAfterPrint?.();
    };

    window.addEventListener("afterprint", handleAfterPrint, { once: true });
    window.print();

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }
</script>

<script lang="ts">
  import { portal } from "$lib/actions/portal";

  interface Props {
    receipt: ThermalReceiptData | null;
  }

  let { receipt }: Props = $props();

  $effect(() => {
    if (typeof document === "undefined" || !receipt) return;

    document.body.classList.add("printing-thermal-receipt");
    let pageStyle = document.getElementById("apoteku-thermal-page-style") as HTMLStyleElement | null;
    let created = false;
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "apoteku-thermal-page-style";
      pageStyle.textContent = "@media print { @page { margin: 0; } }";
      document.head.appendChild(pageStyle);
      created = true;
    }

    return () => {
      document.body.classList.remove("printing-thermal-receipt");
      if (created) {
        pageStyle?.remove();
      }
    };
  });
</script>

{#if receipt}
  <!-- LEMBAR CETAK KHUSUS PRINTER TERMAL (TERSEMBUNYI DI LAYAR, MUNCUL PENUH TANPA CARD SAAT PRINT) -->
  <div
    use:portal
    id="thermal-receipt-sheet"
    class="thermal-receipt-sheet hidden print:block"
    aria-hidden="true"
  >
    <div class="text-center space-y-0.5 mb-1.5">
      <div class="font-bold text-[12px] tracking-wide">{receipt.storeName || "APOTEK HAFIDZ FARMA"}</div>
      <div class="font-semibold text-[10.5px]">{receipt.branchName || "KOTA TASIKMALAYA"}</div>
      <div class="text-[9.5px]">Telp: {receipt.branchPhone || "-"}</div>
      {#if receipt.sia}
        <div class="text-[9.5px]">SIA: {receipt.sia}</div>
      {/if}
      {#if receipt.pharmacistName}
        <div class="text-[9.5px]">Apoteker: {receipt.pharmacistName}</div>
      {/if}
      {#if receipt.isReprint}
        <div class="text-[9px] font-bold uppercase tracking-wider pt-0.5">** CETAK ULANG / COPY STRUK **</div>
      {/if}
    </div>

    <hr class="thermal-receipt-double-divider" />

    <div class="space-y-0.5 text-[10px]">
      <div class="thermal-receipt-row">
        <span>No. Faktur</span>
        <span class="font-semibold text-right break-all">{receipt.invoiceNumber}</span>
      </div>
      <div class="thermal-receipt-row">
        <span>Waktu</span>
        <span class="text-right">{formatThermalDateTime(receipt.transactionTime)}</span>
      </div>
      <div class="thermal-receipt-row">
        <span>Kasir</span>
        <span class="text-right">{receipt.cashierName || "Kasir Utama"}</span>
      </div>
      <div class="thermal-receipt-row">
        <span>Pelanggan</span>
        <span class="text-right">
          {receipt.customerName || "Umum"}{receipt.priceTier ? ` (${receipt.priceTier})` : ""}
        </span>
      </div>
      {#if receipt.patientName}
        <div class="thermal-receipt-row">
          <span>Pasien</span>
          <span class="text-right">{receipt.patientName}</span>
        </div>
      {/if}
      {#if receipt.doctorName}
        <div class="thermal-receipt-row">
          <span>Dokter</span>
          <span class="text-right">{receipt.doctorName}</span>
        </div>
      {/if}
    </div>

    <hr class="thermal-receipt-divider" />

    <div class="space-y-1 text-[10px]">
      {#if receipt.items.length === 0}
        <div class="text-[9.5px] italic text-center py-1">(Tidak ada rincian item tercatat)</div>
      {:else}
        {#each receipt.items as item}
          <div class="thermal-receipt-item">
            <div class="font-bold break-words">
              {item.name}{item.unit ? ` (${item.unit})` : ""}
            </div>
            <div class="thermal-receipt-row">
              <span>{item.quantity} x {formatThermalRupiah(item.unitPrice)}</span>
              <span class="font-semibold ml-auto">{formatThermalRupiah(item.subtotal)}</span>
            </div>
            {#if item.batches && item.batches.length > 0}
              <div class="text-[9px] break-words">
                {#each item.batches as b}[B:{b.batchNumber} ED:{b.expiryDate || "-"}] {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <hr class="thermal-receipt-divider" />

    <div class="space-y-0.5 text-[10px]">
      <div class="thermal-receipt-row">
        <span>Subtotal</span>
        <span>{formatThermalRupiah(receipt.subtotal)}</span>
      </div>
      {#if (receipt.discountAmount ?? 0) > 0}
        <div class="thermal-receipt-row">
          <span>Diskon Faktur</span>
          <span>-{formatThermalRupiah(receipt.discountAmount)}</span>
        </div>
      {/if}
      {#if (receipt.taxAmount ?? 0) > 0}
        <div class="thermal-receipt-row">
          <span>PPN (11%)</span>
          <span>{formatThermalRupiah(receipt.taxAmount)}</span>
        </div>
      {/if}
      {#if (receipt.tuslahAmount ?? 0) > 0}
        <div class="thermal-receipt-row">
          <span>Jasa / Tuslah</span>
          <span>{formatThermalRupiah(receipt.tuslahAmount)}</span>
        </div>
      {/if}
      {#if (receipt.embalaseAmount ?? 0) > 0}
        <div class="thermal-receipt-row">
          <span>Embalase / Wadah</span>
          <span>{formatThermalRupiah(receipt.embalaseAmount)}</span>
        </div>
      {/if}
      {#if (receipt.roundingAmount ?? 0) !== 0}
        <div class="thermal-receipt-row">
          <span>Pembulatan</span>
          <span>{formatThermalRupiah(receipt.roundingAmount)}</span>
        </div>
      {/if}

      <hr class="thermal-receipt-divider" />

      <div class="thermal-receipt-row font-bold text-[11.5px] py-0.5">
        <span>TOTAL AKHIR</span>
        <span>{formatThermalRupiah(receipt.grandTotal)}</span>
      </div>
      <div class="thermal-receipt-row">
        <span>Pembayaran ({receipt.paymentMethod || "CASH"})</span>
        <span>{formatThermalRupiah(receipt.paidAmount)}</span>
      </div>
      <div class="thermal-receipt-row">
        <span>Kembalian</span>
        <span>{formatThermalRupiah(receipt.changeAmount)}</span>
      </div>
    </div>

    <hr class="thermal-receipt-double-divider" />

    <div class="text-center space-y-0.5 text-[9.5px] pt-0.5">
      <div class="font-semibold">Terima kasih atas kunjungan Anda</div>
      <div>Semoga Lekas Sembuh</div>
      <div>-- Ikhtiar Sehat Keluarga --</div>
    </div>
  </div>
{/if}

