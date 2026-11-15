import { queryClient } from '../packages/db/src/client.ts';

async function cleanup() {
  try {
    console.log('=== STARTING TEST DATA CLEANUP ===\n');

    await queryClient.begin(async (tx) => {
      // 1. Delete the 10 test entries in stock_ledger
      const targetLedgerIds = [
        'c12df378-3d1b-4e70-a07c-0bec9fa0fd8b', // FP-2611-3861 Tera F +50
        '4dffd973-9dd3-4931-bc0d-13237cdcddb8', // FP-2611-3861 Caviplex +50
        'ddfcabf4-2505-4f5d-9575-664037bfa1df', // FP-2611-3861 Tera F -50 (Void)
        '109b71d1-689d-476b-8fd3-447b5e3c637c', // FP-2611-3861 Caviplex -50 (Void)
        '25e9d699-33ef-42de-856f-0536323a3646', // FP-2611-1326 Tera F +50
        'e13ad341-6a91-40cb-b1a9-2076eb754643', // FP-2611-1326 Caviplex +50
        '8041bdfb-e6fc-4a61-9357-1af6a2009029', // FP-2611-1326 Tera F -50 (Void)
        '995be3c3-ba9b-4e6c-af75-80706f9110ee', // FP-2611-1326 Caviplex -50 (Void)
        'c4a476f7-d94d-4eb0-82b5-343e0828937c', // FP-2611-6690 AB-Vask +30
        '85d1189f-d0c0-4cd8-b725-1d598c3f4287'  // FP-2611-6690 AB-Vask -30 (Void)
      ];

      const deletedLedger = await tx`
        DELETE FROM stock_ledger
        WHERE id = ANY(${targetLedgerIds})
        RETURNING id, notes;
      `;
      console.log(`Deleted ${deletedLedger.length} test stock_ledger entries:`);
      deletedLedger.forEach(l => console.log(` - [${l.id}] ${l.notes}`));

      // 2. Delete empty/dangling test batches in product_batches
      const targetBatchIds = [
        '82fe6fdf-ed85-4603-9a3a-1f9ce47e630d', // BCH-36351
        'e13e2c0c-a368-400c-8a08-d728bb2e14dc', // BCH-36352
        '77315c95-bbad-4b97-bbd2-d3b00bdcd95b', // BCH-69512
        'f1ac40c5-7752-4f0c-a87c-08ce48ca5bad', // BCH-69501
        'fb17d76a-71d5-4af9-b112-59cd895d3a7a'  // BCH-73641
      ];

      const deletedBatches = await tx`
        DELETE FROM product_batches
        WHERE id = ANY(${targetBatchIds})
        RETURNING id, batch_no;
      `;
      console.log(`\nDeleted ${deletedBatches.length} test product_batches:`);
      deletedBatches.forEach(b => console.log(` - [${b.id}] Batch: ${b.batch_no}`));

      // 3. Delete test PO SP-REG-HF-2026-0004 (AB-VASK 5 with 0 received)
      const testPoId = '1d8ffd31-3a5d-4e97-95fa-25d0973b3177';
      const deletedPoItems = await tx`
        DELETE FROM purchase_order_items
        WHERE purchase_order_id = ${testPoId}
        RETURNING id, notes;
      `;
      const deletedPo = await tx`
        DELETE FROM purchase_orders
        WHERE id = ${testPoId}
        RETURNING id, po_number;
      `;
      console.log(`\nDeleted test Purchase Order:`);
      deletedPo.forEach(p => console.log(` - PO: ${p.po_number}`));
      console.log(`Deleted ${deletedPoItems.length} test PO items.`);
    });

    console.log('\n=== VERIFYING REMAINING STOCK LEDGER & SYSTEM INTEGRITY ===\n');

    const remainingLedger = await queryClient`
      SELECT sl.id, sl.mutation_type, sl.quantity_base, sl.notes, sl.created_at, p.name as product_name
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      ORDER BY sl.created_at ASC;
    `;
    console.log(`Total remaining stock_ledger rows: ${remainingLedger.length}`);
    remainingLedger.forEach(r => {
      console.log(`[${r.created_at}] ${r.product_name} | ${r.mutation_type} | Qty: ${r.quantity_base} | Notes: ${r.notes}`);
    });

    // Check branch stock integrity
    const stocks = await queryClient`
      SELECT p.name as product_name, bs.total_qty_base, b.name as branch_name
      FROM branch_stocks bs
      JOIN products p ON p.id = bs.product_id
      JOIN branches b ON b.id = bs.branch_id
      WHERE p.name IN ('TERA F TAB', 'CAVIPLEX CDEZ STRIP', 'AL HANIF MADU HUTAN 200G', 'ANTANGIN CAIR HABBATUSAUDA', 'AB - VASK 5 (AMLODIPIN 5MG)')
      ORDER BY p.name, b.name;
    `;
    console.log('\n--- CURRENT BRANCH STOCKS ---');
    console.table(stocks);

  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await queryClient.end();
  }
}

cleanup();
