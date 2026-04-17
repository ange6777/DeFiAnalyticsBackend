import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('pools', (table) => {
    table.string('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('address').notNullable().unique();
    table.string('token0_address').notNullable();
    table.string('token1_address').notNullable();
    table.string('token0_symbol').notNullable();
    table.string('token1_symbol').notNullable();
    table.integer('fee').notNullable();
    table.integer('chain_id').notNullable();
    table.enum('protocol', ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve']).notNullable();
    table.timestamps(true, true);
    
    table.index(['address', 'chain_id']);
    table.index(['token0_address', 'token1_address']);
    table.index('protocol');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('pools');
}
