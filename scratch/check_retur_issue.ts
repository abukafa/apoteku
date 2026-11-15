import { queryClient } from '../packages/db/src/client.ts';

async function check() {
  try {
    const returns = await queryClient`
      SELECT cr.*, p.name as product_name
      FROM customer_returns cr
      LEFT JOIN products p ON p.id = cr.product_id
      WHERE cr.return_number ILIKE '%588%';
    `;
    console.log('--- CUSTOMER RETURN 588 ---');
    console.table(returns);

    const ledger = await queryClient`
      SELECT sl.*, p.name as product_name
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      WHERE sl.created_at >= '2026-11-15 00:00:00'
      ORDER BY sl.created_at ASC;
    `;
    console.log('--- STOCK LEDGER TODAY ---');
    console.table(ledger);

    const branchStocks = await queryClient`
      SELECT p.name as product_name, bs.total_qty_base
      FROM branch_stocks bs
      JOIN products p ON p.id = bs.product_id
      WHERE p.name ILIKE '%TERA%';
    `;
    console.log('--- CURRENT TERA STOCK ---');
    console.table(branchStocks);

    const batchStocks = await queryClient`
      SELECT pb.batch_no, p.name as product_name, bbs.qty_base
      FROM branch_batch_stocks bbs
      JOIN product_batches pb ON pb.id = bbs.batch_id
      JOIN products p ON p.id = bbs.product_id
      WHERE p.name ILIKE '%TERA%';
    `;
    console.log('--- CURRENT TERA BATCH STOCK ---');
    console.table(batchStocks);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

check();
