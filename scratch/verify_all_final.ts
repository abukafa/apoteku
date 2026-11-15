import { queryClient } from '../packages/db/src/client.ts';

async function verify() {
  try {
    const teraLedger = await queryClient`
      SELECT sl.id, sl.mutation_type, sl.quantity_base, sl.notes, sl.created_at
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      WHERE p.name ILIKE '%TERA%'
      ORDER BY sl.created_at ASC;
    `;
    console.log('--- ALL TERA F STOCK LEDGER ENTRIES ---');
    console.table(teraLedger);

    let running = 0;
    for (const row of teraLedger) {
      running += Number(row.quantity_base);
      console.log(`[${row.created_at}] Change: ${row.quantity_base.padStart(5)} | Running Balance: ${running} | Notes: ${row.notes}`);
    }

    const teraStock = await queryClient`
      SELECT p.name, bs.total_qty_base
      FROM branch_stocks bs
      JOIN products p ON p.id = bs.product_id
      WHERE p.name ILIKE '%TERA%';
    `;
    console.log('\n--- PHYSICAL BRANCH STOCK ---');
    console.table(teraStock);

    const teraBatch = await queryClient`
      SELECT pb.batch_no, bbs.qty_base
      FROM branch_batch_stocks bbs
      JOIN product_batches pb ON pb.id = bbs.batch_id
      JOIN products p ON p.id = bbs.product_id
      WHERE p.name ILIKE '%TERA%';
    `;
    console.log('\n--- BATCH STOCK ---');
    console.table(teraBatch);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

verify();
