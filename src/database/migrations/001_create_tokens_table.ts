import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('tokens', (table) => {
    table.string('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('address').notNullable().unique();
    table.string('symbol').notNullable();
    table.string('name').notNullable();
    table.integer('decimals').notNullable();
    table.integer('chain_id').notNullable();
    table.string('total_supply');
    table.timestamps(true, true);
    
    table.index(['address', 'chain_id']);
    table.index('symbol');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('tokens');
}
