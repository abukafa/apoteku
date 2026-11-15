import { queryClient } from '../packages/db/src/client.ts';

async function checkBatchReferences() {
  const batchIds = [
    '82fe6fdf-ed85-4603-9a3a-1f9ce47e630d',
    'e13e2c0c-a368-400c-8a08-d728bb2e14dc',
    '77315c95-bbad-4b97-bbd2-d3b00bdcd95b',
    'f1ac40c5-7752-4f0c-a87c-08ce48ca5bad',
    'fb17d76a-71d5-4af9-b112-59cd895d3a7a'
  ];

  try {
    const inSales = await queryClient`SELECT id, batch_id FROM sales_transaction_items WHERE batch_id = ANY(${batchIds});`;
    console.log('In sales_transaction_items:', inSales);

    const inPI = await queryClient`SELECT id, batch_id FROM purchase_invoice_items WHERE batch_id = ANY(${batchIds});`;
    console.log('In purchase_invoice_items:', inPI);

    const inTransfer = await queryClient`SELECT id, batch_id FROM stock_transfer_items WHERE batch_id = ANY(${batchIds});`;
    console.log('In stock_transfer_items:', inTransfer);

    const inBranchBatch = await queryClient`SELECT id, batch_id, qty_base FROM branch_batch_stocks WHERE batch_id = ANY(${batchIds});`;
    console.log('In branch_batch_stocks:', inBranchBatch);

    const inLedger = await queryClient`SELECT id, batch_id, mutation_type, notes FROM stock_ledger WHERE batch_id = ANY(${batchIds});`;
    console.log('In stock_ledger:', inLedger);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

checkBatchReferences();
