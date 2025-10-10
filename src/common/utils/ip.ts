// src/common/utils/ip.ts
import * as ip from 'ip';
export function ipInCidrs(clientIp:string, cidrs:string[]){
  if (!clientIp || !cidrs?.length) return false;
  return cidrs.some(c => ip.cidrSubnet(c).contains(clientIp));
}
