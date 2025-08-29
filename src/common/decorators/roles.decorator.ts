import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums';


export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

export interface RoleMetadata {
  module: string;
  action: string;
}

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (permission: RoleMetadata) =>
  SetMetadata(PERMISSIONS_KEY, permission);
