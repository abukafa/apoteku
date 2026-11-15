import { queryClient } from '../packages/db/src/client.ts';

async function check() {
  try {
    const ret = await queryClient`
      SELECT *
      FROM customer_returns
      WHERE return_number ILIKE '%981%';
    `;
    console.log('--- CUSTOMER RETURN 981 ---');
    console.table(ret);

    const sale = await queryClient`
      SELECT st.*, sti.product_id, sti.qty, sti.unit_name, sti.qty_base
      FROM sales_transactions st
      JOIN sales_transaction_items sti ON sti.transaction_id = st.id
      WHERE st.invoice_no ILIKE '%5837%';
    `;
    console.log('--- SALES TRANSACTION 5837 ---');
    console.table(sale);

    const recentLedger = await queryClient`
      SELECT sl.*, p.name as product_name
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      WHERE sl.created_at >= '2026-11-15 16:00:00'
      ORDER BY sl.created_at ASC;
    `;
    console.log('--- RECENT STOCK LEDGER ENTRIES ---');
    console.table(recentLedger);

    const teraStock = await queryClient`
      SELECT p.name, bs.total_qty_base
      FROM branch_stocks bs
      JOIN products p ON p.id = bs.product_id
      WHERE p.name ILIKE '%TERA%';
    `;
    console.log('--- TERA STOCK IN BRANCH_STOCKS ---');
    console.table(teraStock);

    const cashMut = await queryClient`
      SELECT *
      FROM cash_mutations
      ORDER BY created_at DESC
      LIMIT 5;
    `;
    console.log('--- RECENT CASH MUTATIONS ---');
    console.table(cashMut);

    const shifts = await queryClient`
      SELECT *
      FROM cashier_shifts
      ORDER BY opened_at DESC
      LIMIT 3;
    `;
    console.log('--- CASHIER SHIFTS ---');
    console.table(shifts);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

check();
