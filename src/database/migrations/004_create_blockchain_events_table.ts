import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('blockchain_events', (table) => {
    table.string('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('chain_id').notNullable();
    table.bigInteger('block_number').notNullable();
    table.string('transaction_hash').notNullable();
    table.string('address').notNullable();
    table.string('event_name').notNullable();
    table.jsonb('data').notNullable();
    table.timestamp('timestamp').notNullable();
    table.boolean('processed').defaultTo(false);
    
    table.index(['chain_id', 'block_number']);
    table.index(['address', 'event_name']);
    table.index('processed');
    table.index('timestamp');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('blockchain_events');
}
