import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeletedAtToKitchenTickets1700000000000 implements MigrationInterface {
  name = 'AddDeletedAtToKitchenTickets1700000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kitchen_tickets"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_kitchen_tickets_deleted_at"
      ON "kitchen_tickets" ("deleted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kitchen_tickets_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "kitchen_tickets" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
