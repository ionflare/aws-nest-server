import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePartyDto } from './dto/create-party.dto';
import { JoinPartyByCodeDto } from './dto/join-party-by-code.dto';
import { KickPartyMemberDto } from './dto/kick-party-member.dto';
import { PartiesService } from './parties.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Post('create')
  async createParty(
    @Body() dto: CreatePartyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.partiesService.createParty(req.user.sub, dto);
  }

  @Post('join-by-code')
  async joinPartyByCode(
    @Body() dto: JoinPartyByCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.partiesService.joinPartyByCode(req.user.sub, dto);
  }

  @Get('current')
  async getCurrentParty(@Req() req: AuthenticatedRequest) {
    return this.partiesService.getCurrentParty(req.user.sub);
  }

  @Post('leave')
  async leaveParty(@Req() req: AuthenticatedRequest) {
    return this.partiesService.leaveParty(req.user.sub);
  }

  @Post('kick')
  async kickMember(
    @Body() dto: KickPartyMemberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.partiesService.kickMember(req.user.sub, dto);
  }

  @Post('disband')
  async disbandParty(@Req() req: AuthenticatedRequest) {
    return this.partiesService.disbandParty(req.user.sub);
  }
}