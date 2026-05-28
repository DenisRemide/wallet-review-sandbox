import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PartnerRegistry } from '../infrastructure/partner-registry';

export type AuthenticatedRequest = Request & { partnerId: string };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly partnerRegistry: PartnerRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = request.header('x-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('MISSING_API_KEY');
    }

    const partner = this.partnerRegistry.findByApiKey(apiKey);
    if (!partner) {
      throw new UnauthorizedException('INVALID_API_KEY');
    }

    request.partnerId = partner.id;
    return true;
  }
}
