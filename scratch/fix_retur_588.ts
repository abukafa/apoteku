import { queryClient } from '../packages/db/src/client.ts';

async function fix() {
  try {
    console.log('=== SYNCING RET-JL-20261115-588 TO 100 TABLET ===\n');

    await queryClient.begin(async (tx) => {
      // 1. Update stock_ledger entry
      const updatedLedger = await tx`
        UPDATE stock_ledger
        SET quantity_base = '100.00000000',
            notes = 'Retur Penjualan Pasien (RET-JL-20261115-588): 1 BOX (100 TABLET) - Retur penjualan terverifikasi'
        WHERE reference_id = '7b321ff8-9a99-40e0-89ad-863a38c61d7d'
        RETURNING id, quantity_base, notes;
      `;
      console.log('Updated stock_ledger:', updatedLedger);

      // 2. Adjust branch_stocks: currently 4781, needs +99 to become 4880
      const updatedBranchStock = await tx`
        UPDATE branch_stocks
        SET total_qty_base = '4880.00000000',
            updated_at = NOW()
        WHERE product_id = '6ab11fd9-5dcc-47f0-bd49-b8bef1945042'
          AND branch_id = '81d3bcff-9577-47b6-9a35-7d510c0d4225'
        RETURNING id, total_qty_base;
      `;
      console.log('Updated branch_stocks:', updatedBranchStock);

      // 3. Adjust branch_batch_stocks
      const updatedBatchStock = await tx`
        UPDATE branch_batch_stocks
        SET qty_base = '4880.00000000',
            updated_at = NOW()
        WHERE product_id = '6ab11fd9-5dcc-47f0-bd49-b8bef1945042'
          AND batch_id = 'd8e9501e-4316-43c6-b84b-d5fff4c39214'
          AND branch_id = '81d3bcff-9577-47b6-9a35-7d510c0d4225'
        RETURNING id, qty_base;
      `;
      console.log('Updated branch_batch_stocks:', updatedBatchStock);
    });

    console.log('\n=== VERIFYING FINAL STOCK ===\n');
    const teraStock = await queryClient`
      SELECT p.name, bs.total_qty_base
      FROM branch_stocks bs
      JOIN products p ON p.id = bs.product_id
      WHERE p.id = '6ab11fd9-5dcc-47f0-bd49-b8bef1945042';
    `;
    console.table(teraStock);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

fix();
