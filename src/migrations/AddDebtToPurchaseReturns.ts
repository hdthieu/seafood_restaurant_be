import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDebtToPurchaseReturns1733020000000 implements MigrationInterface {
    name = 'AddDebtToPurchaseReturns1733020000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      ADD "debt" numeric(14,2) NOT NULL DEFAULT 0
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      DROP COLUMN "debt"
    `);
    }
}