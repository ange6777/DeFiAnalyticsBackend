import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('swaps', (table) => {
    table.string('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('transaction_hash').notNullable();
    table.string('pool_address').notNullable();
    table.string('user_address').notNullable();
    table.string('token_in_address').notNullable();
    table.string('token_out_address').notNullable();
    table.decimal('token_in_amount', 36, 18).notNullable();
    table.decimal('token_out_amount', 36, 18).notNullable();
    table.bigInteger('block_number').notNullable();
    table.timestamp('timestamp').notNullable();
    table.integer('chain_id').notNullable();
    
    table.index(['transaction_hash', 'chain_id']);
    table.index(['pool_address', 'timestamp']);
    table.index(['user_address', 'timestamp']);
    table.index('block_number');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('swaps');
}
