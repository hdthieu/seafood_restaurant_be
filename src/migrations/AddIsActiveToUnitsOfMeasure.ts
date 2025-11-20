import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveToUnitsOfMeasure1700000000002 implements MigrationInterface {
    name = 'AddIsActiveToUnitsOfMeasure1700000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "units_of_measure"
      ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "units_of_measure" DROP COLUMN IF EXISTS "is_active"
    `);
    }
}