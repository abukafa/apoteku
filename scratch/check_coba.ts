import { queryClient } from '../packages/db/src/client.ts';

async function checkCoba() {
  const cobas = await queryClient`SELECT id, code, name, is_consignment, is_active FROM suppliers WHERE name ILIKE '%coba%';`;
  console.table(cobas);
  await queryClient.end();
}

checkCoba();
