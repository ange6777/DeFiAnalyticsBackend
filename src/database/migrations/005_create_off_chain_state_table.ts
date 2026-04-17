import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('off_chain_state', (table) => {
    table.string('key').primary();
    table.jsonb('value').notNullable();
    table.timestamp('updated_at').notNullable();
    
    table.index('updated_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('off_chain_state');
}
